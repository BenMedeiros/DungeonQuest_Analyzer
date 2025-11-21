document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const loadDefaultBtn = document.getElementById('loadDefaultBtn');
    const dashboard = document.getElementById('dashboard');
    const sidebar = document.getElementById('sidebar');
    const expandLvl2Btn = document.getElementById('expandLvl2Btn');

    let currentData = null;
    let targetExpandDepth = 0;
    let activePath = [];

    // Intersection Observer for Sidebar Tracking
    const observerOptions = {
        root: null,
        rootMargin: '-80px 0px -80% 0px', // Trigger when element is near the top
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pathStr = entry.target.getAttribute('data-path');
                if (pathStr) {
                    const path = JSON.parse(pathStr);
                    updateSidebar(path);
                }
            }
        });
    }, observerOptions);

    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (loadDefaultBtn) loadDefaultBtn.addEventListener('click', loadDefaultFile);
    if (expandLvl2Btn) {
        expandLvl2Btn.addEventListener('click', () => {
            targetExpandDepth = 2;
            if (currentData) {
                renderDashboard(currentData);
            }
        });
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                currentData = data;
                targetExpandDepth = 0; // Reset depth on new file
                renderDashboard(data);
            } catch (err) {
                alert('Error parsing JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function loadDefaultFile() {
        fetch('../logs/game_analysis.json')
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                currentData = data;
                targetExpandDepth = 0;
                renderDashboard(data);
            })
            .catch(err => {
                alert('Could not load default file. Please use the "Choose File" button.\nError: ' + err.message);
            });
    }

    function updateSidebar(path) {
        if (!sidebar) return;
        sidebar.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'sidebar-title';
        title.textContent = 'Navigation';
        sidebar.appendChild(title);

        path.forEach((segment, index) => {
            const btn = document.createElement('button');
            btn.className = 'sidebar-btn';
            if (index === path.length - 1) btn.classList.add('active');
            
            // Format segment for display
            let displayText = segment;
            if (segment.startsWith('Round')) displayText = segment;
            else if (segment.length > 20) displayText = segment.substring(0, 17) + '...';
            
            btn.textContent = displayText;
            btn.title = segment; // Tooltip for full name
            
            btn.onclick = () => {
                // Find element with this path
                const targetPathStr = JSON.stringify(path.slice(0, index + 1));
                const target = document.querySelector(`[data-path='${targetPathStr}']`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };

            sidebar.appendChild(btn);
        });
    }

    function renderDashboard(data) {
        dashboard.innerHTML = '';
        observer.disconnect(); // Clear old observations
        
        // The root is an object
        const rootPath = ['Root'];
        const rootEl = renderObject(data, 'Game Analysis Root', true, 0, rootPath);
        dashboard.appendChild(rootEl);
        
        updateSidebar(rootPath);
    }

    function createLazyCollapsible(headerText, renderContentFn, autoExpand = false, path = []) {
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible-wrapper';
        if (path.length > 0) {
            wrapper.setAttribute('data-path', JSON.stringify(path));
            observer.observe(wrapper);
        }
        
        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.textContent = headerText;
        
        const content = document.createElement('div');
        content.className = 'collapsible-content';
        
        let isRendered = false;

        const toggle = (e) => {
            if (e) e.stopPropagation();
            
            const isExpanding = !wrapper.classList.contains('expanded');
            wrapper.classList.toggle('expanded');

            if (isExpanding) {
                if (!isRendered || content.innerHTML === '') {
                    const contentEl = renderContentFn();
                    content.innerHTML = '';
                    if (contentEl) {
                        content.appendChild(contentEl);
                    } else {
                        content.textContent = 'No content';
                    }
                    isRendered = true;
                }
            } else {
                // Clear content to save memory
                content.innerHTML = '';
                isRendered = false;
            }
        };

        header.addEventListener('click', toggle);
        
        wrapper.appendChild(header);
        wrapper.appendChild(content);

        if (autoExpand) {
            wrapper.classList.add('expanded');
            const contentEl = renderContentFn();
            if (contentEl) {
                content.appendChild(contentEl);
            }
            isRendered = true;
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

    function renderValue(key, value, depth, path) {
        if (value === null || value === undefined) {
            const span = document.createElement('span');
            span.className = 'field-value';
            span.textContent = 'null';
            return span;
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                const span = document.createElement('span');
                span.className = 'field-value';
                span.textContent = '[]';
                return span;
            }
            
            const newPath = [...path, key];
            return createLazyCollapsible(
                `${key} [${value.length}]`, 
                () => renderTable(value, depth + 1, newPath), 
                depth < targetExpandDepth,
                newPath
            );
        }

        if (typeof value === 'object') {
            const businessKey = getBusinessKey(value);
            const header = businessKey ? `${key} - ${businessKey}` : key;
            const newPath = [...path, businessKey || key];
            
            return createLazyCollapsible(
                header,
                () => renderObject(value, null, false, depth + 1, newPath),
                depth < targetExpandDepth,
                newPath
            );
        }

        const span = document.createElement('span');
        span.className = 'field-value';
        
        if (typeof value === 'number' && (key.includes('Probability') || key === 'drawProbability' || key === 'randomPlacementProbability')) {
             span.textContent = value.toFixed(3);
        } else {
             span.textContent = String(value);
        }
        return span;
    }

    function renderObject(obj, title = null, expanded = false, depth = 0, path = []) {
        const card = document.createElement('div');
        card.className = 'card';
        if (path.length > 0) {
            card.setAttribute('data-path', JSON.stringify(path));
            observer.observe(card);
        }

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'card-title';
            titleEl.textContent = title;
            card.appendChild(titleEl);
        }

        const primitives = [];
        const complex = [];

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                complex.push(key);
            } else {
                primitives.push(key);
            }
        }

        primitives.forEach(key => {
            const row = document.createElement('div');
            row.className = 'field-row';
            
            const label = document.createElement('div');
            label.className = 'field-label';
            label.textContent = key;
            
            const valEl = renderValue(key, obj[key], depth, path);
            
            row.appendChild(label);
            row.appendChild(valEl);
            card.appendChild(row);
        });

        complex.forEach(key => {
            const valEl = renderValue(key, obj[key], depth, path);
            card.appendChild(valEl);
        });

        return card;
    }

    function renderTable(arr, depth, path) {
        if (!arr.length) return document.createTextNode('Empty Array');

        const processedArr = arr.map(item => {
            if (item && typeof item === 'object' && item.nextRound && typeof item.nextRound === 'object') {
                const { nextRound, ...rest } = item;
                return { ...rest, ...nextRound };
            }
            return item;
        });

        const allKeys = new Set();
        processedArr.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                Object.keys(item).forEach(k => allKeys.add(k));
            } else {
                allKeys.add('Value');
            }
        });

        const primitiveCols = [];
        const complexCols = [];
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
        
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
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

        const tbody = document.createElement('tbody');
        processedArr.forEach((item, index) => {
            const tr = document.createElement('tr');
            const itemPath = [...path, `[${index}]`];
            
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
                const td = document.createElement('td');
                td.textContent = String(item);
                tr.appendChild(td);
            } else {
                primitiveCols.forEach(col => {
                    const td = document.createElement('td');
                    const val = item[col];
                    
                    if (col === 'actions' && Array.isArray(val) && val.every(v => typeof v === 'string')) {
                        val.forEach(action => {
                            const badge = document.createElement('span');
                            badge.className = `action-badge action-${action}`;
                            badge.textContent = action;
                            td.appendChild(badge);
                        });
                    } else {
                        td.appendChild(renderValue(col, val, depth, itemPath));
                    }
                    
                    tr.appendChild(td);
                });
            }
            tbody.appendChild(tr);

            if (complexCols.length > 0) {
                const detailTr = document.createElement('tr');
                detailTr.style.display = 'none';
                detailTr.className = 'detail-row';
                
                const detailTd = document.createElement('td');
                detailTd.colSpan = primitiveCols.length + 1;
                
                const detailContent = document.createElement('div');
                detailContent.className = 'detail-content-wrapper';
                
                complexCols.forEach(col => {
                    const val = item[col];
                    if (val !== undefined && val !== null) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'detail-field-wrapper';
                        
                        const label = document.createElement('div');
                        label.className = 'detail-field-label';
                        label.textContent = col;
                        
                        wrapper.appendChild(label);
                        wrapper.appendChild(renderValue(col, val, depth + 1, [...itemPath, col]));
                        detailContent.appendChild(wrapper);
                    }
                });
                
                detailTd.appendChild(detailContent);
                detailTr.appendChild(detailTd);
                tbody.appendChild(detailTr);

                const btn = tr.querySelector('.row-expand-btn');
                const toggleDetail = () => {
                    const isHidden = detailTr.style.display === 'none';
                    detailTr.style.display = isHidden ? 'table-row' : 'none';
                    btn.textContent = isHidden ? '▼' : '▶';
                    tr.classList.toggle('selected', isHidden);
                };

                btn.onclick = (e) => {
                    e.stopPropagation();
                    toggleDetail();
                };
                
                if (depth < targetExpandDepth) {
                    toggleDetail();
                }
            }
        });
        table.appendChild(tbody);
        container.appendChild(table);

        return container;
    }

    window.collapseAll = () => {
        document.querySelectorAll('.collapsible-wrapper.expanded').forEach(el => {
            el.classList.remove('expanded');
            const content = el.querySelector('.collapsible-content');
            if (content) content.innerHTML = '';
        });
    };
});