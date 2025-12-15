document.addEventListener('DOMContentLoaded', () => {
        const sidebar = document.getElementById('sidebar');
        const sidebarShell = sidebar?.closest('.sidebar-shell');
        const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

        if (sidebarToggleBtn && sidebarShell) {
            sidebarToggleBtn.addEventListener('click', () => {
                const collapsed = sidebarShell.classList.toggle('sidebar-collapsed');
                sidebarToggleBtn.textContent = collapsed ? '❯' : '❮';
            });
        }
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
    let selectedNodePath = null; // legacy display path (strings)
    let selectedD3Node = null;   // legacy pointer (graph)

    const state = {
        // Selector path segments: `k:propName` and `i:index`
        selectedSelPath: [],
        // Sidebar breadcrumbs: { label, selLen } where selLen is selector-path prefix length
        breadcrumbs: [{ label: 'Root', selLen: 0 }],
        // Shared expansion state (selector-path JSON strings)
        expandedSelPaths: new Set(),
    };

    function isNodeObject(obj) {
        if (!obj || typeof obj !== 'object') return false;
        if (typeof obj.t === 'string') return true;
        // Heuristic for older logs / compact decoding
        return obj.round !== undefined || obj.turn !== undefined || obj.placement !== undefined || obj.drawKey !== undefined || obj.actions !== undefined;
    }

    function labelForNode(node) {
        if (!node || typeof node !== 'object') return String(node);

        // Draw node
        if (node.t === 'DrawNode' || node.drawKey !== undefined || node.drawCombination !== undefined) {
            const key = node.drawKey ?? node.drawCombination;
            return `Draw: ${key}`;
        }

        // Placement node
        if (node.t === 'PlacementNode' || node.placement !== undefined) {
            return `Placement: ${String(node.placement)}`;
        }

        // Offense turn node
        if (node.t === 'OffenseTurnNode' || (node.turn === 'O' && node.gold !== undefined)) {
            const r = node.round ?? '?';
            const g = node.gold ?? '?';
            return `Offense R${r} Gold ${g}`;
        }

        // Defense node
        if (node.t === 'DefenseNode' || (node.turn === 'D' && node.tileBag !== undefined)) {
            const r = node.round ?? '?';
            const bag = node.tileBag ?? '?';
            return `Defense R${r} Bag ${bag}`;
        }

        // Action node
        if (node.t === 'ActionNode' || Array.isArray(node.actions)) {
            const actions = Array.isArray(node.actions) ? node.actions : [];
            const formatted = formatActions(actions);
            const text = Array.isArray(formatted) ? formatted.join(', ') : String(formatted);
            return text ? `Action: ${text}` : 'Action';
        }

        // Fallback business key
        const businessKey = getBusinessKey(node);
        if (businessKey) return businessKey;

        return node.t ? String(node.t) : 'Node';
    }

    function labelForContainerKey(key) {
        // Keep this minimal and predictable; prefer leaving raw key if unknown.
        if (key === 'potentialDraws') return 'Draws';
        if (key === 'placementPermutations') return 'Placements';
        if (key === 'turnActions') return 'Actions';
        return String(key);
    }

    function shouldCollapseCollectionKey(key) {
        // These are known collections of node objects; breadcrumbs should show the node label, not `key` + `[index]`.
        return key === 'potentialDraws' || key === 'placementPermutations' || key === 'turnActions';
    }

    function computeBreadcrumbsFromSelPath(root, selPath) {
        const breadcrumbs = [{ label: 'Root', selLen: 0 }];
        let curr = root;

        const segments = Array.isArray(selPath) ? selPath : [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const parsed = parseSelSegment(seg);

            if (parsed.type === 'key') {
                const nextSeg = segments[i + 1];
                const nextParsed = nextSeg ? parseSelSegment(nextSeg) : null;
                const container = (curr && typeof curr === 'object') ? curr[parsed.key] : undefined;

                // If this key points to an array and next is an index, collapse key+index into one node label
                if (Array.isArray(container) && nextParsed && nextParsed.type === 'index') {
                    const item = container[nextParsed.index];
                    if ((item && typeof item === 'object') && (isNodeObject(item) || shouldCollapseCollectionKey(parsed.key))) {
                        breadcrumbs.push({ label: labelForNode(item), selLen: i + 2 });
                        curr = item;
                        i++; // consume index segment
                        continue;
                    }

                    // Non-node items: show container label then index label
                    breadcrumbs.push({ label: labelForContainerKey(parsed.key), selLen: i + 1 });
                    breadcrumbs.push({ label: `[${nextParsed.index}]`, selLen: i + 2 });
                    curr = item;
                    i++;
                    continue;
                }

                // If key points directly to a node object, show node label (not raw key)
                // Also treat `nextRound` as a node step even if the heuristics miss it.
                if ((container && typeof container === 'object') && (isNodeObject(container) || parsed.key === 'nextRound')) {
                    breadcrumbs.push({ label: labelForNode(container), selLen: i + 1 });
                    curr = container;
                    continue;
                }

                // Otherwise, show container key label
                breadcrumbs.push({ label: labelForContainerKey(parsed.key), selLen: i + 1 });
                curr = container;
                continue;
            }

            if (parsed.type === 'index') {
                if (!Array.isArray(curr)) {
                    breadcrumbs.push({ label: `[${parsed.index}]`, selLen: i + 1 });
                    curr = undefined;
                    continue;
                }
                const item = curr[parsed.index];
                breadcrumbs.push({ label: isNodeObject(item) ? labelForNode(item) : `[${parsed.index}]`, selLen: i + 1 });
                curr = item;
                continue;
            }

            breadcrumbs.push({ label: String(seg), selLen: i + 1 });
            curr = undefined;
        }

        // Remove consecutive duplicates
        const deduped = [];
        for (const b of breadcrumbs) {
            if (deduped.length === 0 || deduped[deduped.length - 1].label !== b.label) deduped.push(b);
        }
        return deduped;
    }

    function selKey(key) {
        return `k:${key}`;
    }

    function selIndex(index) {
        return `i:${index}`;
    }

    function selPathStr(selPath) {
        return JSON.stringify(selPath);
    }

    function getTreeElBySelPath(selPath) {
        const s = selPathStr(selPath);
        return document.querySelector(`[data-sel-path="${CSS.escape(s)}"]`);
    }

    async function ensureTreeSelPathVisible(selPath, options = {}) {
        if (!Array.isArray(selPath) || selPath.length === 0) return;

        for (let i = 1; i <= selPath.length; i++) {
            const prefix = selPath.slice(0, i);
            const el = getTreeElBySelPath(prefix);
            if (!el) break;
            if (el.classList.contains('collapsible-wrapper') && !el.classList.contains('expanded')) {
                const header = el.querySelector('.collapsible-header');
                if (header) header.click();
                await new Promise(r => setTimeout(r, 0));
            }
        }

        const target = getTreeElBySelPath(selPath);
        if (target && options.scroll !== false) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('highlight-node');
            setTimeout(() => target.classList.remove('highlight-node'), 1200);
        }
    }

    async function applyExpandedStateToTree() {
        const paths = Array.from(state.expandedSelPaths)
            .map(s => {
                try { return JSON.parse(s); } catch { return null; }
            })
            .filter(p => Array.isArray(p) && p.length > 0)
            .sort((a, b) => a.length - b.length);

        for (const p of paths) {
            await ensureTreeSelPathVisible(p, { scroll: false });
        }
    }

    function setCurrentNode(selPath, displayPathIgnored, dataContext, options = {}) {
        state.selectedSelPath = Array.isArray(selPath) ? selPath : [];
        state.breadcrumbs = computeBreadcrumbsFromSelPath(currentData, state.selectedSelPath);
        selectedNodePath = state.breadcrumbs.map(b => b.label);

        renderSidebarNavigation();
        if (dataContext !== undefined) {
            const name = state.breadcrumbs[state.breadcrumbs.length - 1]?.label || 'Node';
            updateDetails({
                name,
                type: 'object',
                data: dataContext,
            });
        }

        if (options.syncView !== false) {
            if (currentView === 'tree') {
                ensureTreeSelPathVisible(state.selectedSelPath);
            } else {
                ensureGraphSelPathVisible(state.selectedSelPath);
            }
        }
    }
    
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
            state.expandedSelPaths.clear();
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
            
            if (state.selectedSelPath && state.selectedSelPath.length > 0) {
                const target = getTreeElBySelPath(state.selectedSelPath);
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

            // Sync: restore expansions then scroll to selection
            setTimeout(async () => {
                await applyExpandedStateToTree();
                if (state.selectedSelPath && state.selectedSelPath.length > 0) {
                    await ensureTreeSelPathVisible(state.selectedSelPath);
                }
            }, 50);

        } else {
            dashboard.style.display = 'none';
            vizContainer.style.display = 'block';
            toggleViewBtn.textContent = 'Switch to Tree View';

            if (currentData && !isGraphInitialized) {
                initGraph(currentData);
                isGraphInitialized = true;
            }

            // Sync: expand/center on selection
            if (state.selectedSelPath) {
                setTimeout(() => {
                    applyExpandedStateToGraph();
                    ensureGraphSelPathVisible(state.selectedSelPath);
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
                state.expandedSelPaths.clear();
                    setCurrentNode([], null, currentData, { syncView: false });

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
        const candidates = [
            'logs/game_analysis.json',
            '../logs/game_analysis.json',
            'viewer/logs/game_analysis.json',
            '/logs/game_analysis.json',
            '/viewer/logs/game_analysis.json',
        ];

        fetchFirstJson(candidates)
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
                state.expandedSelPaths.clear();
                    setCurrentNode([], null, currentData, { syncView: false });

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

    function fetchFirstJson(urls) {
        const list = Array.isArray(urls) ? urls : [];
        if (list.length === 0) return Promise.reject(new Error('No URLs to fetch'));

        const tried = [];
        return (async () => {
            for (const url of list) {
                try {
                    const r = await fetch(url, { cache: 'no-cache' });
                    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
                    return await r.json();
                } catch (err) {
                    tried.push(`${url}: ${err?.message || String(err)}`);
                }
            }
            throw new Error(`All default-file URLs failed. Tried: ${tried.join(' | ')}`);
        })();
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
            name: "Root",
            type: "root",
            data: data,
            expanded: false,
            x: width / 2,
            y: height / 2,
            selSegment: null,
            selPath: [],
            displayPath: ['Root']
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

            const isIndexKey = /^\[\d+\]$/.test(child.key);
            const childIndex = isIndexKey ? Number(child.key.slice(1, -1)) : null;
            const selSegment = isIndexKey ? selIndex(childIndex) : selKey(child.key);
            const childSelPath = [...(node.selPath || []), selSegment];

            const businessKey = (child.value && typeof child.value === 'object') ? getBusinessKey(child.value) : null;
            const displaySegment = isIndexKey ? (businessKey || child.key) : child.key;
            const childDisplayPath = [...(node.displayPath || ['Root']), displaySegment];

            const newNode = {
                id: `node_${nodeIdCounter++}`,
                name: child.key,
                type: childType,
                data: child.value,
                expanded: false,
                x: ix,
                y: iy,
                parent: node,
                selSegment,
                selPath: childSelPath,
                displayPath: childDisplayPath
            };

            nodes.push(newNode);
            links.push({ source: node.id, target: newNode.id });
        });

        node.expanded = true;
        if (node.selPath) state.expandedSelPaths.add(selPathStr(node.selPath));
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
        if (node.selPath) state.expandedSelPaths.delete(selPathStr(node.selPath));
        updateViz();
    }

    function ensureGraphSelPathVisible(selPath, options = {}) {
        if (!currentData) return;

        if (!isGraphInitialized) {
            initGraph(currentData);
            isGraphInitialized = true;
        }

        let curr = nodes.find(n => n.type === 'root');
        if (!curr) return;

        for (const seg of (Array.isArray(selPath) ? selPath : [])) {
            if (!curr.expanded) expandNode(curr);
            let next = nodes.find(n => n.parent === curr && n.selSegment === seg);
            if (!next) {
                // Try expanding once more in case children were not created yet
                expandNode(curr);
                next = nodes.find(n => n.parent === curr && n.selSegment === seg);
            }
            if (!next) break;
            curr = next;
        }

        selectedD3Node = curr;
        if (options.updateDetails !== false) updateDetails(curr);
        if (options.center !== false) centerNode(curr);
    }

    function applyExpandedStateToGraph() {
        const paths = Array.from(state.expandedSelPaths)
            .map(s => {
                try { return JSON.parse(s); } catch { return null; }
            })
            .filter(p => Array.isArray(p) && p.length > 0)
            .sort((a, b) => a.length - b.length);

        for (const p of paths) {
            ensureGraphSelPathVisible(p, { center: false, updateDetails: false });
        }
    }

    function updateDetails(node) {
        // Normalize input: node can be a D3 node or a simple object from Tree View
        // D3 node: { name, type, data, ... }
        // Tree object: { name, type, data }
        
        const { props } = getChildren(node.data);
        let html = `<div class="sidebar-title">${node.name}</div>`;
        html += `<div class="detail-item"><span class="detail-label">Type</span><span class="detail-value">${node.type || 'object'}</span></div>`;
        
        // Add Center Button
        html += `<button id="centerNodeBtn" class="sidebar-btn sidebar-center-btn">Center on Node</button>`;

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
                    ensureTreeSelPathVisible(state.selectedSelPath);
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
            setCurrentNode(d.selPath || [], null, d.data, { syncView: false });
            updateDetails(d);
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
        // Deprecated: graph clicks now call `setCurrentNode()`.
    }

    function updateSidebar(path) {
        // Legacy signature: treat `path` as a *display path*.
        state.selectedDisplayPath = Array.isArray(path) && path.length > 0 ? path : ['Root'];
        renderSidebarNavigation();
    }

    function renderSidebarNavigation() {
        if (!sidebarNav) return;
        sidebarNav.innerHTML = '';
        const breadcrumbs = state.breadcrumbs || [{ label: 'Root', selLen: 0 }];

        breadcrumbs.forEach((crumb, index) => {
            const btn = document.createElement('button');
            btn.className = 'sidebar-btn';
            if (index === breadcrumbs.length - 1) btn.classList.add('active');

            let displayText = crumb.label;
            if (typeof displayText === 'string' && displayText.length > 20) displayText = displayText.substring(0, 17) + '...';
            btn.textContent = displayText;
            btn.title = crumb.label;

            btn.onclick = () => {
                const targetSel = state.selectedSelPath.slice(0, crumb.selLen);
                const targetDisplay = breadcrumbs.slice(0, index + 1).map(c => c.label);
                const dataAt = getDataAtSelPath(currentData, targetSel);
                setCurrentNode(targetSel, targetDisplay, dataAt);
            };

            sidebarNav.appendChild(btn);
        });
    }

    function renderDashboard(data) {
        dashboard.innerHTML = '';
        
        // The root is an object
        const rootDisplayPath = ['Root'];
        const rootSelPath = [];
        const rootEl = renderObject(data, 'Game Analysis Root', true, 0, rootDisplayPath, rootSelPath);
        dashboard.appendChild(rootEl);

        setCurrentNode(rootSelPath, null, data, { syncView: false });
    }

    function createLazyCollapsible(headerText, renderContentFn, autoExpand = false, displayPath = [], selPath = [], dataContext = null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible-wrapper';
        wrapper.setAttribute('data-path', JSON.stringify(displayPath));
        wrapper.setAttribute('data-sel-path', selPathStr(selPath));
        // observer.observe(wrapper); // Removed observer
        
        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.textContent = headerText;
        
        const content = document.createElement('div');
        content.className = 'collapsible-content';
        
        let isRendered = false;

        const toggle = (e) => {
            if (e) e.stopPropagation();
            
            // Update selection
            setCurrentNode(selPath, displayPath, dataContext, { syncView: false });

            const isExpanding = !wrapper.classList.contains('expanded');
            wrapper.classList.toggle('expanded');

            const sp = selPathStr(selPath);
            if (isExpanding) {
                state.expandedSelPaths.add(sp);
            } else {
                state.expandedSelPaths.delete(sp);
            }

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

        if (autoExpand || state.expandedSelPaths.has(selPathStr(selPath))) {
            wrapper.classList.add('expanded');
            state.expandedSelPaths.add(selPathStr(selPath));
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

    function parseSelSegment(seg) {
        const s = String(seg);
        if (s.startsWith('k:')) return { type: 'key', key: s.slice(2) };
        if (s.startsWith('i:')) return { type: 'index', index: Number(s.slice(2)) };
        return { type: 'unknown', raw: s };
    }

    function getDataAtSelPath(root, selPath) {
        let curr = root;
        if (!Array.isArray(selPath)) return curr;
        for (const seg of selPath) {
            const p = parseSelSegment(seg);
            if (p.type === 'key') {
                if (!curr || typeof curr !== 'object') return undefined;
                curr = curr[p.key];
            } else if (p.type === 'index') {
                if (!Array.isArray(curr)) return undefined;
                curr = curr[p.index];
            } else {
                return undefined;
            }
        }
        return curr;
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

    function renderValue(key, value, depth, displayPath, selPath) {
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

        if (Array.isArray(value) && String(key).toLowerCase() === 'placementpermutations') {
            const newDisplayPath = [...displayPath, key];
            const newSelPath = [...selPath, selKey(key)];
            return renderTable(value, depth + 1, newDisplayPath, newSelPath);
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                const span = document.createElement('span');
                span.className = 'field-value';
                span.textContent = '[]';
                return span;
            }
            
            const newDisplayPath = [...displayPath, key];
            const newSelPath = [...selPath, selKey(key)];
            return createLazyCollapsible(
                `${key} [${value.length}]`, 
                () => renderTable(value, depth + 1, newDisplayPath, newSelPath), 
                depth < targetExpandDepth,
                newDisplayPath,
                newSelPath,
                value
            );
        }

        if (typeof value === 'object') {
            const businessKey = getBusinessKey(value);
            const header = businessKey ? `${key} - ${businessKey}` : key;
            const newDisplayPath = [...displayPath, businessKey || key];
            const newSelPath = [...selPath, selKey(key)];
            
            return createLazyCollapsible(
                header,
                () => renderObject(value, null, false, depth + 1, newDisplayPath, newSelPath),
                depth < targetExpandDepth,
                newDisplayPath,
                newSelPath,
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

    function renderObject(obj, title = null, expanded = false, depth = 0, displayPath = [], selPath = []) {
        const card = document.createElement('div');
        card.className = 'card';

        const nodeWin = obj && typeof obj === 'object' ? obj.win : null;
        if (nodeWin === 'D') card.classList.add('win-defense');
        if (nodeWin === 'O') card.classList.add('win-offense');

        const canOffenseWin = obj && typeof obj === 'object' ? obj.canOffenseWin : null;
        if (canOffenseWin === true) card.classList.add('cofw-true');
        if (canOffenseWin === false) card.classList.add('cofw-false');

        const isActionNode = obj && typeof obj === 'object' && obj.t === 'ActionNode';
        card.setAttribute('data-path', JSON.stringify(displayPath));
        card.setAttribute('data-sel-path', selPathStr(selPath));
        if (displayPath.length > 0) {
            // observer.observe(card); // Removed observer
            
            // Add click handler for selection
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                setCurrentNode(selPath, displayPath, obj, { syncView: false });
                updateDetails({
                    name: title || displayPath[displayPath.length - 1] || 'Object',
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

        // Render DefenseNode and OffenseTurnNode as a single-row table for fields
        if (obj && (obj.t === 'DefenseNode' || obj.t === 'OffenseTurnNode')) {
            const table = document.createElement('table');
            table.className = 'node-detail-table';
            const thead = document.createElement('thead');
            const trHead = document.createElement('tr');
            const tbody = document.createElement('tbody');
            const trBody = document.createElement('tr');
            const keysShownInTable = new Set();
            // Only show primitive + simple-array fields (not complex arrays/objects)
            for (const [key, value] of Object.entries(obj)) {
                const isSimpleNumberArray = Array.isArray(value) && value.every(v => typeof v === 'number');
                const isSimpleStringArray = Array.isArray(value) && value.every(v => typeof v === 'string');

                if (typeof value !== 'object' || value === null || isSimpleNumberArray || isSimpleStringArray) {
                    const th = document.createElement('th');
                    th.textContent = key;
                    trHead.appendChild(th);
                    const td = document.createElement('td');

                    if (isSimpleNumberArray || isSimpleStringArray) {
                        td.textContent = value.join(',');
                    } else {
                        td.textContent = value;
                    }

                    trBody.appendChild(td);
                    keysShownInTable.add(key);
                }
            }
            thead.appendChild(trHead);
            table.appendChild(thead);
            tbody.appendChild(trBody);
            table.appendChild(tbody);
            card.appendChild(table);
            // Special: for DefenseNode, render potentialDraws as a plain table (no wrapper)
            if (obj.t === 'DefenseNode' && Array.isArray(obj.potentialDraws) && obj.potentialDraws.length > 0) {
                const drawsTable = renderTable(
                    obj.potentialDraws,
                    depth + 1,
                    [...displayPath, 'potentialDraws'],
                    [...selPath, selKey('potentialDraws')]
                );
                card.appendChild(drawsTable);
            }
            // Render other complex fields (arrays/objects) below as before, except potentialDraws
            for (const [key, value] of Object.entries(obj)) {
                if (key === 'potentialDraws') continue;
                if (keysShownInTable.has(key)) continue;
                if (typeof value === 'object' && value !== null) {
                    const valEl = renderValue(key, value, depth, displayPath, selPath);
                    card.appendChild(valEl);
                }
            }
            return card;
        }
        // Default: old label/value block rendering for other node types
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
                valEl = renderTable(formatActions(obj[key]), depth + 1, [...displayPath, key], [...selPath, selKey(key)]);
            } else if (isActionNode && key === 'units' && Array.isArray(obj[key]) && obj[key].length > 0) {
                valEl = renderTable(obj[key], depth + 1, [...displayPath, key], [...selPath, selKey(key)]);
            } else {
                valEl = renderValue(key, obj[key], depth, displayPath, selPath);
            }
            row.appendChild(label);
            row.appendChild(valEl);
            card.appendChild(row);
        });
        complex.forEach(key => {
            const valEl = renderValue(key, obj[key], depth, displayPath, selPath);
            card.appendChild(valEl);
        });
        return card;
    }

    function renderTable(arr, depth, displayPath, selPath) {
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
            th.className = 'expander-col';
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
            const itemSelPath = [...selPath, selIndex(index)];
            const businessKey = (item && typeof item === 'object') ? getBusinessKey(item) : null;
            const itemDisplayPath = [...displayPath, businessKey || `[${index}]`];
            
            if (complexCols.length > 0) {
                const td = document.createElement('td');
                const btn = document.createElement('button');
                btn.textContent = '▶';
                btn.className = 'row-expand-btn';
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
                        td.appendChild(renderTable(formatActions(val), depth + 1, [...itemDisplayPath, col], [...itemSelPath, selKey(col)]));
                        tr.appendChild(td);
                        return;
                    }

                    if (item.t === 'ActionNode' && col === 'units' && Array.isArray(val) && val.length > 0) {
                        // Inline tables for ActionNode units inside parent tables
                        td.appendChild(renderTable(val, depth + 1, [...itemDisplayPath, col], [...itemSelPath, selKey(col)]));
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
                        td.appendChild(renderValue(col, val, depth, itemDisplayPath, itemSelPath));
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
                        
                        // Remove detail-field-label: just show value
                        wrapper.appendChild(renderValue(col, val, depth + 1, [...itemDisplayPath, col], [...itemSelPath, selKey(col)]));
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
                    setCurrentNode(itemSelPath, null, item, { syncView: false });
                    
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
        state.expandedSelPaths.clear();
    };
});