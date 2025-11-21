document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const loadDefaultBtn = document.getElementById('loadDefaultBtn');
    const dashboard = document.getElementById('dashboard');

    fileInput.addEventListener('change', handleFileSelect);
    loadDefaultBtn.addEventListener('click', loadDefaultFile);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                renderDashboard(data);
            } catch (err) {
                alert('Error parsing JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function loadDefaultFile() {
        // Try to fetch relative to the HTML file
        fetch('../logs/game_analysis.json')
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => renderDashboard(data))
            .catch(err => {
                alert('Could not load default file. Please use the "Choose File" button.\nError: ' + err.message);
            });
    }

    function renderDashboard(data) {
        dashboard.innerHTML = '';
        // The root is an object (Round 1)
        dashboard.appendChild(renderObject(data, 'Game Analysis Root', true));
    }

    // Helper to create a lazy collapsible section
    function createLazyCollapsible(headerText, renderContentFn, autoExpand = false) {
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible-wrapper';
        
        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.textContent = headerText;
        
        const content = document.createElement('div');
        content.className = 'collapsible-content';
        
        const toggle = (e) => {
            if (e) {
                e.stopPropagation();
            }
            
            const isExpanding = !wrapper.classList.contains('expanded');
            wrapper.classList.toggle('expanded');

            if (isExpanding) {
                // Render content on expand
                const contentEl = renderContentFn();
                content.innerHTML = ''; // Clear just in case
                if (contentEl) {
                    content.appendChild(contentEl);
                } else {
                    content.textContent = 'No content';
                }
            } else {
                // Remove content on collapse to save memory/DOM
                content.innerHTML = '';
            }
        };

        header.addEventListener('click', toggle);
        
        wrapper.appendChild(header);
        wrapper.appendChild(content);

        if (autoExpand) {
            // Manually trigger expansion logic
            wrapper.classList.add('expanded');
            const contentEl = renderContentFn();
            if (contentEl) {
                content.appendChild(contentEl);
            }
        }

        return wrapper;
    }

    function getBusinessKey(obj) {
        if (obj.round !== undefined && obj.turn !== undefined) return `Round ${obj.round} (${obj.turn})`;
        if (obj.placement) return `Placement: ${obj.placement}`;
        if (obj.drawCombination) return `Draw: ${obj.drawCombination}`;
        if (obj.combination) return `Comb: ${obj.combination}`;
        return null;
    }

    function renderValue(key, value) {
        if (value === null || value === undefined) {
            const span = document.createElement('span');
            span.className = 'field-value';
            span.textContent = 'null';
            return span;
        }

        if (Array.isArray(value)) {
            // Special handling for empty arrays
            if (value.length === 0) {
                const span = document.createElement('span');
                span.className = 'field-value';
                span.textContent = '[]';
                return span;
            }
            
            // Render array as a lazy collapsible table
            return createLazyCollapsible(
                `${key} [${value.length}]`, 
                () => renderTable(value), 
                false // Collapse arrays by default
            );
        }

        if (typeof value === 'object') {
            // Render object as a lazy collapsible card
            const businessKey = getBusinessKey(value);
            const header = businessKey ? `${key} - ${businessKey}` : key;
            
            return createLazyCollapsible(
                header,
                () => renderObject(value),
                false // Collapse objects by default
            );
        }

        // Primitive values
        const span = document.createElement('span');
        span.className = 'field-value';
        
        // Format probabilities to 3 decimal places
        if (typeof value === 'number' && (key.includes('Probability') || key === 'drawProbability' || key === 'randomPlacementProbability')) {
             span.textContent = value.toFixed(3);
        } else {
             span.textContent = String(value);
        }
        return span;
    }

    function renderObject(obj, title = null, expanded = false) {
        const card = document.createElement('div');
        card.className = 'card';

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'card-title';
            titleEl.textContent = title;
            card.appendChild(titleEl);
        }

        // Separate primitive fields from complex fields (objects/arrays)
        const primitives = [];
        const complex = [];

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                complex.push(key);
            } else {
                primitives.push(key);
            }
        }

        // Render primitives first
        primitives.forEach(key => {
            const row = document.createElement('div');
            row.className = 'field-row';
            
            const label = document.createElement('div');
            label.className = 'field-label';
            label.textContent = key;
            
            const valEl = renderValue(key, obj[key]);
            
            row.appendChild(label);
            row.appendChild(valEl);
            card.appendChild(row);
        });

        // Render complex fields
        complex.forEach(key => {
            // For complex fields, we might want them to take full width or be collapsible
            // renderValue returns a collapsible wrapper for objects/arrays
            const valEl = renderValue(key, obj[key]);
            card.appendChild(valEl);
        });

        return card;
    }

    function renderTable(arr) {
        if (!arr.length) return document.createTextNode('Empty Array');

        // Flatten nextRound for better display
        const processedArr = arr.map(item => {
            if (item && typeof item === 'object' && item.nextRound && typeof item.nextRound === 'object') {
                const { nextRound, ...rest } = item;
                return { ...rest, ...nextRound };
            }
            return item;
        });

        // Determine columns from all keys in all objects
        const allKeys = new Set();
        processedArr.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(k => allKeys.add(k));
            } else {
                allKeys.add('Value');
            }
        });

        // Separate primitive and complex columns
        const primitiveCols = [];
        const complexCols = [];
        
        // Sample the first few items to determine type (heuristic)
        const sampleSize = Math.min(processedArr.length, 5);
        
        allKeys.forEach(key => {
            if (key === 'Value') {
                primitiveCols.push(key);
                return;
            }
            
            let isComplex = false;
            for (let i = 0; i < sampleSize; i++) {
                const val = processedArr[i][key];
                if (typeof val === 'object' && val !== null) {
                    // Check if it's a simple array of strings (like actions)
                    if (Array.isArray(val) && val.every(v => typeof v === 'string')) {
                        isComplex = false;
                    } else {
                        isComplex = true;
                    }
                    break;
                }
            }
            
            if (isComplex) {
                complexCols.push(key);
            } else {
                primitiveCols.push(key);
            }
        });

        const container = document.createElement('div');
        container.className = 'table-container';
        
        const table = document.createElement('table');
        table.className = 'data-table';
        
        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Add expand column if there are complex fields
        if (complexCols.length > 0) {
            const th = document.createElement('th');
            th.style.width = '30px';
            headerRow.appendChild(th);
        }

        primitiveCols.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        processedArr.forEach(item => {
            const tr = document.createElement('tr');
            
            // Expand button cell
            if (complexCols.length > 0) {
                const td = document.createElement('td');
                const btn = document.createElement('button');
                btn.textContent = '▶';
                btn.className = 'row-expand-btn';
                btn.style.cursor = 'pointer';
                btn.style.border = 'none';
                btn.style.background = 'none';
                btn.style.color = '#2980b9';
                btn.style.fontWeight = 'bold';
                
                td.appendChild(btn);
                tr.appendChild(td);
            }

            if (typeof item !== 'object' || item === null) {
                // Array of primitives
                const td = document.createElement('td');
                td.textContent = String(item);
                tr.appendChild(td);
            } else {
                primitiveCols.forEach(col => {
                    const td = document.createElement('td');
                    const val = item[col];
                    
                    // Special handling for 'actions' array of strings
                    if (col === 'actions' && Array.isArray(val) && val.every(v => typeof v === 'string')) {
                        val.forEach(action => {
                            const badge = document.createElement('span');
                            badge.className = `action-badge action-${action}`;
                            badge.textContent = action;
                            td.appendChild(badge);
                        });
                    } else {
                        td.appendChild(renderValue(col, val));
                    }
                    
                    tr.appendChild(td);
                });
            }
            tbody.appendChild(tr);

            // Detail Row for complex fields
            if (complexCols.length > 0) {
                const detailTr = document.createElement('tr');
                detailTr.style.display = 'none';
                detailTr.className = 'detail-row';
                
                const detailTd = document.createElement('td');
                detailTd.colSpan = primitiveCols.length + 1;
                detailTd.style.padding = '0 0 0 2rem';
                detailTd.style.backgroundColor = '#f8f9fa';
                
                const detailContent = document.createElement('div');
                detailContent.style.padding = '1rem';
                
                // Render complex fields here
                complexCols.forEach(col => {
                    const val = item[col];
                    if (val !== undefined && val !== null) {
                        const wrapper = document.createElement('div');
                        wrapper.style.marginBottom = '1rem';
                        
                        // Label
                        const label = document.createElement('div');
                        label.textContent = col;
                        label.style.fontWeight = '600';
                        label.style.marginBottom = '0.5rem';
                        label.style.color = '#7f8c8d';
                        
                        wrapper.appendChild(label);
                        wrapper.appendChild(renderValue(col, val));
                        detailContent.appendChild(wrapper);
                    }
                });
                
                detailTd.appendChild(detailContent);
                detailTr.appendChild(detailTd);
                tbody.appendChild(detailTr);

                // Wire up the button
                const btn = tr.querySelector('.row-expand-btn');
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const isHidden = detailTr.style.display === 'none';
                    detailTr.style.display = isHidden ? 'table-row' : 'none';
                    btn.textContent = isHidden ? '▼' : '▶';
                    tr.style.backgroundColor = isHidden ? '#e8f4f8' : '';
                };
            }
        });
        table.appendChild(tbody);
        container.appendChild(table);

        return container;
    }

    // Expose global functions for buttons
    window.collapseAll = () => {
        document.querySelectorAll('.collapsible-wrapper.expanded').forEach(el => {
            el.classList.remove('expanded');
        });
    };
    
    window.expandLevel = (level) => {
        // Simple heuristic: expand the first N levels of collapsibles
        // This is tricky with lazy loading. We can only expand what's rendered.
        // For now, just expand the top level children
        const root = document.querySelector('#dashboard > .card');
        if (!root) return;
        
        // Find direct collapsible children
        // This is a bit hacky for "Level 1", but works for immediate needs
        const wrappers = Array.from(root.children).filter(c => c.classList.contains('collapsible-wrapper'));
        wrappers.forEach(w => {
            const header = w.querySelector('.collapsible-header');
            if (header) header.click();
        });
    };
});