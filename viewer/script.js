document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const loadDefaultBtn = document.getElementById('loadDefaultBtn');
    const dashboard = document.getElementById('dashboard');
    const expandLvl2Btn = document.getElementById('expandLvl2Btn');
    const toggleViewBtn = document.getElementById('toggleViewBtn');
    const vizContainer = document.getElementById('viz-container');
    const sidebarNav = document.getElementById('sidebar-nav');
    const sidebarDetails = document.getElementById('sidebar-details');

    let currentData = null;
    let targetExpandDepth = 0;
    let activePath = [];
    let currentView = 'tree'; // 'tree' or 'graph'
    let isTreeInitialized = false;
    let isGraphInitialized = false;
    
    // D3 Variables
    let svg, g, zoom, simulation;
    let nodes = [], links = [], nodeIdCounter = 0;
    let width, height;

    // Intersection Observer for Sidebar Tracking
    const observerOptions = {
        root: null,
        rootMargin: '-80px 0px -80% 0px', // Trigger when element is near the top
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        if (currentView !== 'tree') return; // Only track in tree view
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
                if (currentView === 'tree') {
                    renderDashboard(currentData);
                } else {
                    // Maybe expand graph? For now just switch to tree
                    alert("Switching to Tree View to expand levels.");
                    switchView('tree');
                    renderDashboard(currentData);
                }
            }
        });
    }
    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', () => {
            const newView = currentView === 'tree' ? 'graph' : 'tree';
            switchView(newView);
        });
    }

    function switchView(view) {
        currentView = view;
        if (view === 'tree') {
            dashboard.style.display = 'block';
            vizContainer.style.display = 'none';
            sidebarNav.style.display = 'block';
            sidebarDetails.style.display = 'none';
            toggleViewBtn.textContent = 'Switch to Graph View';
            
            if (currentData && !isTreeInitialized) {
                renderDashboard(currentData);
                isTreeInitialized = true;
            }
        } else {
            dashboard.style.display = 'none';
            vizContainer.style.display = 'block';
            sidebarNav.style.display = 'none';
            sidebarDetails.style.display = 'block';
            toggleViewBtn.textContent = 'Switch to Tree View';
            
            if (currentData && !isGraphInitialized) {
                initGraph(currentData);
                isGraphInitialized = true;
            }
        }
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
                isTreeInitialized = false;
                isGraphInitialized = false;
                
                if (currentView === 'tree') {
                    renderDashboard(data);
                    isTreeInitialized = true;
                } else {
                    initGraph(data);
                    isGraphInitialized = true;
                }
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
                isTreeInitialized = false;
                isGraphInitialized = false;

                if (currentView === 'tree') {
                    renderDashboard(data);
                    isTreeInitialized = true;
                } else {
                    initGraph(data);
                    isGraphInitialized = true;
                }
            })
            .catch(err => {
                alert('Could not load default file. Please use the "Choose File" button.\nError: ' + err.message);
            });
    }

    // --- D3 Graph Logic ---

    function initGraph(data) {
        vizContainer.innerHTML = ''; // Clear previous graph
        width = vizContainer.clientWidth;
        height = vizContainer.clientHeight;

        svg = d3.select("#viz-container").append("svg")
            .attr("width", width)
            .attr("height", height)
            .on("contextmenu", (e) => e.preventDefault());

        g = svg.append("g");

        zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom);

        simulation = d3.forceSimulation()
            .force("link", d3.forceLink().id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-500))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide(50).iterations(2));

        nodes = [];
        links = [];
        nodeIdCounter = 0;

        // Create Root Node
        const rootNode = {
            id: `node_${nodeIdCounter++}`,
            name: "Game Root",
            type: "root",
            data: data,
            expanded: false,
            x: width / 2,
            y: height / 2
        };

        nodes.push(rootNode);
        updateViz();
        expandNode(rootNode);
        
        // Handle resize
        window.addEventListener('resize', () => {
            if (currentView === 'graph') {
                width = vizContainer.clientWidth;
                height = vizContainer.clientHeight;
                svg.attr("width", width).attr("height", height);
                simulation.force("center", d3.forceCenter(width / 2, height / 2));
                simulation.alpha(0.3).restart();
            }
        });
    }

    function getChildren(data) {
        const children = [];
        const props = {};

        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                children.push({ key: `[${index}]`, value: item });
            });
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'object' && value !== null) {
                    children.push({ key: key, value: value });
                } else {
                    props[key] = value;
                }
            }
        }
        return { children, props };
    }

    function getNodeColor(type) {
        const colors = {
            root: "#e74c3c",
            round: "#3498db",
            turn: "#2ecc71",
            placement: "#9b59b6",
            default: "#95a5a6"
        };
        return colors[type] || colors.default;
    }

    function getNodeType(key, value) {
        if (key.toLowerCase().includes('round')) return 'round';
        if (key.toLowerCase().includes('turn')) return 'turn';
        if (key.toLowerCase().includes('placement')) return 'placement';
        return 'default';
    }

    function expandNode(node) {
        if (node.expanded) return;

        const { children } = getChildren(node.data);
        if (children.length === 0) return;

        const angleStep = (2 * Math.PI) / children.length;
        const radius = 100;

        children.forEach((child, index) => {
            const childType = getNodeType(child.key, child.value);
            const angle = index * angleStep;
            const ix = node.x + radius * Math.cos(angle);
            const iy = node.y + radius * Math.sin(angle);

            const newNode = {
                id: `node_${nodeIdCounter++}`,
                name: child.key,
                type: childType,
                data: child.value,
                expanded: false,
                x: ix,
                y: iy,
                parent: node
            };

            nodes.push(newNode);
            links.push({ source: node.id, target: newNode.id });
        });

        node.expanded = true;
        updateViz();
    }

    function collapseNode(node) {
        if (!node.expanded) return;

        function getDescendantIds(parentId) {
            const childLinks = links.filter(l => l.source.id === parentId);
            let ids = [];
            childLinks.forEach(l => {
                ids.push(l.target.id);
                ids = ids.concat(getDescendantIds(l.target.id));
            });
            return ids;
        }

        const idsToRemove = new Set(getDescendantIds(node.id));
        nodes = nodes.filter(n => !idsToRemove.has(n.id));
        links = links.filter(l => !idsToRemove.has(l.target.id) && !idsToRemove.has(l.source.id));

        node.expanded = false;
        updateViz();
    }

    function updateDetails(node) {
        const { props } = getChildren(node.data);
        let html = `<div class="sidebar-title">${node.name}</div>`;
        html += `<div class="detail-item"><span class="detail-label">Type</span><span class="detail-value">${node.type}</span></div>`;
        
        for (const [key, value] of Object.entries(props)) {
            html += `
                <div class="detail-item">
                    <span class="detail-label">${key}</span>
                    <span class="detail-value">${value}</span>
                </div>
            `;
        }
        sidebarDetails.innerHTML = html;
    }

    function centerNode(node) {
        const scale = 1.0; // Reduced from 1.5
        const x = -node.x * scale + width / 2;
        const y = -node.y * scale + height / 2;
        
        svg.transition().duration(750).call(
            zoom.transform, 
            d3.zoomIdentity.translate(x, y).scale(scale)
        );
    }

    function updateViz() {
        const link = g.selectAll(".link")
            .data(links, d => d.target ? d.target.id : d.source + "-" + d.target);

        link.exit().remove();

        const linkEnter = link.enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", 1);

        const linkMerge = linkEnter.merge(link);

        const node = g.selectAll(".node")
            .data(nodes, d => d.id);

        node.exit().transition().duration(300).attr("r", 0).remove();

        const nodeEnter = node.enter().append("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        nodeEnter.append("circle")
            .attr("r", 0)
            .attr("fill", d => getNodeColor(d.type))
            .transition().duration(300).attr("r", 20);

        nodeEnter.append("text")
            .attr("dy", 30)
            .attr("text-anchor", "middle")
            .text(d => d.name);

        const nodeMerge = nodeEnter.merge(node);

        nodeMerge.on("click", (event, d) => {
            event.stopPropagation();
            updateDetails(d);
            updateSidebarFromNode(d);
            centerNode(d);
            if (!d.expanded) expandNode(d);
        });
        
        nodeMerge.on("contextmenu", (event, d) => {
            event.preventDefault();
            collapseNode(d);
        });

        simulation.nodes(nodes).on("tick", ticked);
        simulation.force("link").links(links);
        simulation.alpha(1).restart();

        function ticked() {
            linkMerge
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            nodeMerge
                .attr("transform", d => `translate(${d.x},${d.y})`);
        }
    }

    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // --- End D3 Logic ---

    function updateSidebarFromNode(node) {
        const path = [];
        let curr = node;
        while (curr) {
            path.unshift(curr.name);
            curr = curr.parent;
        }
        updateSidebar(path);
    }

    function updateSidebar(path) {
        if (!sidebarNav) return;
        sidebarNav.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'sidebar-title';
        title.textContent = 'Navigation';
        sidebarNav.appendChild(title);

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
                if (currentView === 'tree') {
                    // Find element with this path
                    const targetPathStr = JSON.stringify(path.slice(0, index + 1));
                    const target = document.querySelector(`[data-path='${targetPathStr}']`);
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                } else {
                    // Graph view navigation
                    const targetPath = path.slice(0, index + 1);
                    const targetNode = nodes.find(n => {
                        if (n.name !== targetPath[targetPath.length - 1]) return false;
                        // Check ancestry
                        let curr = n;
                        for (let i = targetPath.length - 1; i >= 0; i--) {
                            if (!curr || curr.name !== targetPath[i]) return false;
                            curr = curr.parent;
                        }
                        return true;
                    });
                    
                    if (targetNode) {
                        centerNode(targetNode);
                        updateDetails(targetNode);
                        updateSidebarFromNode(targetNode);
                    }
                }
            };

            sidebarNav.appendChild(btn);
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