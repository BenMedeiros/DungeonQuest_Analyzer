document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const loadDefaultBtn = document.getElementById('loadDefaultBtn');
    const dashboard = document.getElementById('dashboard');
    const expandLvl1Btn = document.getElementById('expandLvl1Btn');
    const expandLvl2Btn = document.getElementById('expandLvl2Btn');
    const expandLvl3Btn = document.getElementById('expandLvl3Btn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
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
    let selectedNodePath = null; // For Tree View sync
    let selectedD3Node = null;   // For Graph View sync
    
    // D3 Variables
    let svg, g, zoom, simulation;
    let nodes = [], links = [], nodeIdCounter = 0;
    let width, height;

    // Intersection Observer removed as per user request

    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (loadDefaultBtn) loadDefaultBtn.addEventListener('click', loadDefaultFile);
    
    if (expandLvl1Btn) expandLvl1Btn.addEventListener('click', () => handleExpand(1));
    if (expandLvl2Btn) expandLvl2Btn.addEventListener('click', () => handleExpand(2));
    if (expandLvl3Btn) expandLvl3Btn.addEventListener('click', () => handleExpand(3));
    if (collapseAllBtn) collapseAllBtn.addEventListener('click', () => {
        if (currentView === 'tree') {
            document.querySelectorAll('.collapsible-wrapper.expanded').forEach(el => {
                el.classList.remove('expanded');
                const content = el.querySelector('.collapsible-content');
                if (content) content.innerHTML = '';
            });
        } else {
            // Collapse all in graph - reset to root
            if (nodes.length > 0) {
                const root = nodes.find(n => n.type === 'root');
                if (root) {
                    // Collapse everything else
                    nodes.forEach(n => {
                        if (n !== root && n.expanded) collapseNode(n);
                    });
                    // Reset root expansion if needed, or just keep root expanded
                    // Actually collapseNode logic might need to be called on root's children?
                    // Simpler: Re-init graph
                    initGraph(currentData);
                }
            }
        }
    });

    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', () => {
            const newView = currentView === 'tree' ? 'graph' : 'tree';
            switchView(newView);
        });
    }

    function handleExpand(depth) {
        if (!currentData) return;

        if (currentView === 'tree') {
            // If we have a selected path, try to expand from there
            // For now, the original logic was global expansion. 
            // The user asked for "actively selected node".
            // In tree view, we don't strictly have a "selected node" variable yet unless we track clicks.
            // Let's assume if selectedNodePath is set, we expand that. Otherwise global.
            
            if (selectedNodePath && selectedNodePath.length > 0) {
                // Find the element
                const pathStr = JSON.stringify(selectedNodePath);
                // Escape single quotes for selector
                const safeSelector = pathStr.replace(/'/g, "\\'");
                const target = document.querySelector(`[data-path='${safeSelector}']`);
                if (target) {
                    // We need to expand this node and its children up to depth
                    // This is tricky with lazy loading. We might need to force render.
                    // For now, let's stick to the original global behavior if no selection, 
                    // or implement a recursive expander for the target.
                    expandTreeRecursive(target, depth);
                } else {
                    // Fallback to global
                    targetExpandDepth = depth;
                    renderDashboard(currentData);
                }
            } else {
                targetExpandDepth = depth;
                renderDashboard(currentData);
            }
        } else {
            // Graph View
            const nodeToExpand = selectedD3Node || nodes.find(n => n.type === 'root');
            if (nodeToExpand) {
                expandGraphRecursive(nodeToExpand, depth);
            }
        }
    }

    function expandTreeRecursive(element, depth) {
        if (depth <= 0) return;
        
        // If it's a wrapper, expand it
        if (element.classList.contains('collapsible-wrapper')) {
            if (!element.classList.contains('expanded')) {
                element.querySelector('.collapsible-header').click();
            }
            
            // Wait for render? The click handler is synchronous in our implementation
            const content = element.querySelector('.collapsible-content');
            if (content) {
                const children = content.querySelectorAll('.collapsible-wrapper');
                children.forEach(child => expandTreeRecursive(child, depth - 1));
                
                // Also handle tables with complex rows
                const tableRows = content.querySelectorAll('.row-expand-btn');
                tableRows.forEach(btn => {
                    // Check if already expanded
                    if (btn.textContent === '▶') {
                        btn.click();
                    }
                    // Recurse into details? Table details structure is different.
                    // The detail row is the next sibling
                    const tr = btn.closest('tr');
                    const detailTr = tr.nextElementSibling;
                    if (detailTr && detailTr.classList.contains('detail-row')) {
                        const wrappers = detailTr.querySelectorAll('.detail-field-wrapper > .collapsible-wrapper');
                        wrappers.forEach(w => expandTreeRecursive(w, depth - 1));
                    }
                });
            }
        }
    }

    function expandGraphRecursive(node, depth) {
        if (depth <= 0) return;
        
        if (!node.expanded) {
            expandNode(node);
        }
        
        // Get children
        const childLinks = links.filter(l => l.source.id === node.id);
        childLinks.forEach(l => {
            const childNode = l.target;
            expandGraphRecursive(childNode, depth - 1);
        });
    }

    function switchView(view) {
        currentView = view;
        if (view === 'tree') {
            dashboard.style.display = 'block';
            vizContainer.style.display = 'none';
            // sidebarNav.style.display = 'block'; // Always visible
            // sidebarDetails.style.display = 'none'; // Always visible
            toggleViewBtn.textContent = 'Switch to Graph View';
            
            if (currentData && !isTreeInitialized) {
                renderDashboard(currentData);
                isTreeInitialized = true;
            }

            // Sync: Scroll to selected node
            if (selectedNodePath) {
                setTimeout(() => {
                    const pathStr = JSON.stringify(selectedNodePath);
                    const safeSelector = pathStr.replace(/'/g, "\\'");
                    const target = document.querySelector(`[data-path='${safeSelector}']`);
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Highlight it?
                        target.classList.add('highlight-node'); // We should add CSS for this
                        setTimeout(() => target.classList.remove('highlight-node'), 2000);
                    }
                }, 100);
            }

        } else {
            dashboard.style.display = 'none';
            vizContainer.style.display = 'block';
            toggleViewBtn.textContent = 'Switch to Tree View';

            if (currentData && !isGraphInitialized) {
                initGraph(currentData);
                isGraphInitialized = true;
            }

            // Sync: center on selected D3 node if any
            if (selectedD3Node) {
                setTimeout(() => {
                    centerNode(selectedD3Node);
                }, 50);
            }
        }
    }

    function handleFileSelect(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(String(e.target.result));
                currentData = data;
                targetExpandDepth = 0;
                isTreeInitialized = false;
                isGraphInitialized = false;

                if (currentView === 'tree') {
                    renderDashboard(currentData);
                    isTreeInitialized = true;
                } else {
                    initGraph(currentData);
                    isGraphInitialized = true;
                }
            } catch (err) {
                alert('Could not parse JSON file.\nError: ' + err.message);
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
                // Backward-compatible: decode older compact logs (class-name payloads)
                if (data && typeof data === 'object' && !data.t) {
                    const compactKeys = ['DefenseNode', 'DrawNode', 'PlacementNode', 'OffenseTurnNode', 'ActionNode'];
                    for (const k of compactKeys) {
                        if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
                        const payload = data[k];

                        if (k === 'DefenseNode') {
                            const parts = typeof payload === 'string' ? payload.split(',') : payload;
                            data.t = 'DefenseNode';
                            data.round = Number(parts[0]);
                            data.turn = parts[1];
                            data.tileBag = parts[2];
                        } else if (k === 'DrawNode') {
                            const parts = typeof payload === 'string' ? payload.split(',') : payload;
                            data.t = 'DrawNode';
                            data.drawKey = parts[0];
                            data.drawProbability = Number(parts[1]);
                            data.randomPlacementProbability = Number(parts[2]);
                        } else if (k === 'PlacementNode') {
                            data.t = 'PlacementNode';
                            data.placement = typeof payload === 'string' ? payload : String(payload[0] ?? payload);
                        } else if (k === 'OffenseTurnNode') {
                            const parts = typeof payload === 'string' ? payload.split(',') : payload;
                            data.t = 'OffenseTurnNode';
                            data.round = Number(parts[0]);
                            data.turn = parts[1];
                            data.gold = Number(parts[2]);
                        } else if (k === 'ActionNode') {
                            data.t = 'ActionNode';
                            data.finalGold = typeof payload === 'string' ? Number(payload) : Number(payload[0]);
                        }

                        delete data[k];
                        break;
                    }
                }

                currentData = data;
                targetExpandDepth = 0;
                isTreeInitialized = false;
                isGraphInitialized = false;

                if (currentView === 'tree') {
                    renderDashboard(currentData);
                    isTreeInitialized = true;
                } else {
                    initGraph(currentData);
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

        // Compact tuple decoding: analyzer may store primitive-heavy fields under class-name keys.
        // Keep nested arrays/objects unchanged, but expand tuples into friendly props.
        if (typeof data === 'object' && data !== null) {
            const tupleKeys = ['DefenseNode', 'DrawNode', 'PlacementNode', 'OffenseTurnNode', 'ActionNode'];
            const tupleKey = tupleKeys.find(k => (typeof data[k] === 'string') || Array.isArray(data[k]));

            if (tupleKey) {
                const raw = data[tupleKey];
                const tuple = Array.isArray(raw)
                    ? raw
                    : String(raw).split(',').map(s => s.trim());

                if (tupleKey === 'DefenseNode') {
                    props.round = Number(tuple[0]);
                    props.turn = tuple[1];
                    props.tileBag = tuple[2];
                } else if (tupleKey === 'DrawNode') {
                    props.drawKey = tuple[0];
                    props.drawProbability = Number(tuple[1]);
                    props.randomPlacementProbability = Number(tuple[2]);
                } else if (tupleKey === 'PlacementNode') {
                    props.placement = tuple[0];
                } else if (tupleKey === 'OffenseTurnNode') {
                    props.round = Number(tuple[0]);
                    props.turn = tuple[1];
                    props.gold = Number(tuple[2]);
                } else if (tupleKey === 'ActionNode') {
                    props.finalGold = Number(tuple[0]);
                } else {
                    props[tupleKey] = tuple;
                }
            }
        }

        if (Object.prototype.hasOwnProperty.call(props, 'units')) {
            props.units = formatUnits(props.units);
        }

        if (Object.prototype.hasOwnProperty.call(props, 'unitSpawnSource') && !Object.prototype.hasOwnProperty.call(props, 'unitSourceCounts')) {
            props.unitSourceCounts = props.unitSpawnSource;
            delete props.unitSpawnSource;
        }

        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                children.push({ key: `[${index}]`, value: item });
            });
        } else if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                if (key === 'DefenseNode' || key === 'DrawNode' || key === 'PlacementNode' || key === 'OffenseTurnNode' || key === 'ActionNode') continue;
                if (typeof value === 'object' && value !== null) {
                    children.push({ key: key, value: value });
                } else {
                    props[key] = value;
                }
            }
        }
        return { children, props };
    }

    function formatUnits(units) {
        if (!Array.isArray(units)) return units;
        if (units.every(u => typeof u === 'string')) return units;
        if (units.every(u => Array.isArray(u) && u.length >= 2)) {
            return units.map(u => `${u[0]}::${u[1]}`);
        }
        return units;
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
        // Normalize input: node can be a D3 node or a simple object from Tree View
        // D3 node: { name, type, data, ... }
        // Tree object: { name, type, data }
        
        const { props } = getChildren(node.data);
        let html = `<div class="sidebar-title">${node.name}</div>`;
        html += `<div class="detail-item"><span class="detail-label">Type</span><span class="detail-value">${node.type || 'object'}</span></div>`;
        
        // Add Center Button
        html += `<button id="centerNodeBtn" class="sidebar-btn" style="margin-bottom: 1rem; background-color: #e3f2fd; color: #1565c0;">Center on Node</button>`;

        for (const [key, value] of Object.entries(props)) {
            html += `
                <div class="detail-item">
                    <span class="detail-label">${key}</span>
                    <span class="detail-value">${value}</span>
                </div>
            `;
        }
        sidebarDetails.innerHTML = html;

        // Attach event listener to the new button
        const btn = document.getElementById('centerNodeBtn');
        if (btn) {
            btn.onclick = () => {
                if (currentView === 'graph') {
                    // If we have a D3 node reference (node.x exists), use it
                    if (node.x !== undefined) {
                        centerNode(node);
                    } else if (selectedD3Node) {
                        // Fallback to selectedD3Node if it matches
                        centerNode(selectedD3Node);
                    } else {
                        // Try to find it in graph
                        const found = nodes.find(n => n.name === node.name); // Weak matching
                        if (found) centerNode(found);
                    }
                } else {
                    // Tree View: Scroll to element
                    if (selectedNodePath) {
                        const pathStr = JSON.stringify(selectedNodePath);
                        const safeSelector = pathStr.replace(/'/g, "\\'");
                        const target = document.querySelector(`[data-path='${safeSelector}']`);
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            target.classList.add('highlight-node');
                            setTimeout(() => target.classList.remove('highlight-node'), 2000);
                        }
                    }
                }
            };
        }
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
            selectedD3Node = d; // Update global state
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
        selectedNodePath = path; // Update global state
        updateSidebar(path);
    }

    function updateSidebar(path) {
        if (!sidebarNav) return;
        sidebarNav.innerHTML = '';

        // Title removed to avoid duplication

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
                    // We need to be careful with the selector. 
                    // JSON.stringify might produce strings that need escaping in CSS selectors.
                    // Instead of querySelector, let's iterate or use a safer method if possible.
                    // But querySelector is fastest. Let's try to escape single quotes.
                    const targetPathStr = JSON.stringify(path.slice(0, index + 1));
                    // Escape single quotes in the attribute value for the selector
                    const safeSelector = targetPathStr.replace(/'/g, "\\'");
                    const target = document.querySelector(`[data-path='${safeSelector}']`);
                    
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Also update selection state to this node
                        selectedNodePath = path.slice(0, index + 1);
                        // Re-render sidebar to show this as active? 
                        // The click handler above already sets active class on button creation, 
                        // but if we click a parent, we might want to update the sidebar to show *that* path?
                        // Usually navigation jumps to the item. 
                        // If I click "Root" in "Root > Child", do I want to see just "Root"?
                        // Yes, probably.
                        updateSidebar(selectedNodePath);
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
        
        // The root is an object
        const rootPath = ['Root'];
        const rootEl = renderObject(data, 'Game Analysis Root', true, 0, rootPath);
        dashboard.appendChild(rootEl);
        
        updateSidebar(rootPath);
    }

    function createLazyCollapsible(headerText, renderContentFn, autoExpand = false, path = [], dataContext = null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible-wrapper';
        if (path.length > 0) {
            wrapper.setAttribute('data-path', JSON.stringify(path));
            // observer.observe(wrapper); // Removed observer
        }
        
        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.textContent = headerText;
        
        const content = document.createElement('div');
        content.className = 'collapsible-content';
        
        let isRendered = false;

        const toggle = (e) => {
            if (e) e.stopPropagation();
            
            // Update selection
            if (path.length > 0) {
                selectedNodePath = path;
                updateSidebar(path);
                
                if (dataContext) {
                    updateDetails({
                        name: headerText,
                        type: 'object',
                        data: dataContext
                    });
                }
            }

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
        if (obj.drawKey || obj.drawCombination) return `Draw: ${obj.drawKey ?? obj.drawCombination}`;
        if (obj.combination) return `Comb: ${obj.combination}`;
        return null;
    }

    function formatAction(action) {
        if (!action || typeof action !== 'object') return String(action);
        if (action.type === 'spawn') {
            const unitType = action.unitType ?? '?';
            const location = action.location ?? '?';
            return `spawn ${unitType}@${location}`;
        }
        if (action.type === 'move') {
            const unitIndex = action.unitIndex ?? '?';
            const from = action.from ?? '?';
            const to = action.to ?? '?';
            return `move #${unitIndex} ${from}→${to}`;
        }
        return action.type ? String(action.type) : JSON.stringify(action);
    }

    function formatActions(actions) {
        if (!Array.isArray(actions)) return actions;
        return actions.map(formatAction);
    }

    function renderValue(key, value, depth, path) {
        if (value === null || value === undefined) {
            const span = document.createElement('span');
            span.className = 'field-value';
            span.textContent = 'null';
            return span;
        }

        if (key === 'unitSourceCounts' && Array.isArray(value) && value.every(v => typeof v === 'number')) {
            const span = document.createElement('span');
            span.className = 'field-value';
            span.textContent = value.join(',');
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
                newPath,
                value
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
                newPath,
                value
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

        const nodeWin = obj && typeof obj === 'object' ? obj.win : null;
        if (nodeWin === 'D') card.classList.add('win-defense');
        if (nodeWin === 'O') card.classList.add('win-offense');

        const canOffenseWin = obj && typeof obj === 'object' ? obj.canOffenseWin : null;
        if (canOffenseWin === true) card.classList.add('cofw-true');
        if (canOffenseWin === false) card.classList.add('cofw-false');

        const isActionNode = obj && typeof obj === 'object' && obj.t === 'ActionNode';
        if (path.length > 0) {
            card.setAttribute('data-path', JSON.stringify(path));
            // observer.observe(card); // Removed observer
            
            // Add click handler for selection
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedNodePath = path;
                updateSidebar(path);
                updateDetails({
                    name: title || path[path.length - 1] || 'Object',
                    type: 'object',
                    data: obj
                });
            });
        }

        if (title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'card-title';
            titleEl.textContent = title;

            if (nodeWin === 'D' || nodeWin === 'O') {
                const badge = document.createElement('span');
                badge.className = `win-badge ${nodeWin === 'D' ? 'defense' : 'offense'}`;
                badge.textContent = nodeWin === 'D' ? 'WIN: Defense' : 'WIN: Offense';
                titleEl.appendChild(badge);
            }

            if (canOffenseWin === true || canOffenseWin === false) {
                const badge = document.createElement('span');
                badge.className = `cofw-badge ${canOffenseWin ? 'yes' : 'no'}`;
                badge.textContent = canOffenseWin ? 'Offense can win' : 'Offense cannot win';
                titleEl.appendChild(badge);
            }
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

            let valEl;
            if (isActionNode && key === 'actions' && Array.isArray(obj[key]) && obj[key].length > 0) {
                // Render ActionNode actions as compact strings (stable columns)
                valEl = renderTable(formatActions(obj[key]), depth + 1, [...path, key]);
            } else if (isActionNode && key === 'units' && Array.isArray(obj[key]) && obj[key].length > 0) {
                // Inline table for compact ActionNode units
                valEl = renderTable(obj[key], depth + 1, [...path, key]);
            } else {
                valEl = renderValue(key, obj[key], depth, path);
            }
            
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

        // Do not flatten `nextRound` into the parent row.
        // It overwrites fields like `t`, `round`, and `turn` (e.g., ActionNode becomes DefenseNode).
        const processedArr = arr;

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

                    if (item.t === 'ActionNode' && col === 'actions' && Array.isArray(val) && val.length > 0) {
                        // Render ActionNode actions as compact strings
                        td.appendChild(renderTable(formatActions(val), depth + 1, [...itemPath, col]));
                        tr.appendChild(td);
                        return;
                    }

                    if (item.t === 'ActionNode' && col === 'units' && Array.isArray(val) && val.length > 0) {
                        // Inline tables for ActionNode units inside parent tables
                        td.appendChild(renderTable(val, depth + 1, [...itemPath, col]));
                        tr.appendChild(td);
                        return;
                    }
                    
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
                    selectedNodePath = itemPath;
                    updateSidebar(itemPath);
                    
                    // Update details for table row item
                    updateDetails({
                        name: `Item [${index}]`,
                        type: 'object',
                        data: item
                    });
                    
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