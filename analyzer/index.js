import fs from 'fs';

function cloneUnits(units) {
    return units.map(u => ({ ...u }));
}

function cloneSpawnSourceCounts(counts) {
    return Array.isArray(counts) ? counts.slice() : null;
}

const unitTypeEnum = Object.freeze({
    BASIC: 0,
    SPRINTER: 1
});

const UNIT_TYPE_ORDER = [unitTypeEnum.BASIC, unitTypeEnum.SPRINTER];

const unitCosts = Object.freeze({
    [unitTypeEnum.BASIC]: 2,
    [unitTypeEnum.SPRINTER]: 3
});

function encodeUnits(units) {
    return units.map(u => `${u.type}::${u.location}`);
}

function getInitialSpawnSourceCounts() {
    return [1, 1];
}

function spawnCountIndex(unitType) {
    const idx = UNIT_TYPE_ORDER.indexOf(unitType);
    if (idx < 0) throw new Error(`Unknown unit type id: ${unitType}`);
    return idx;
}

function getSpawnCount(counts, unitType) {
    return counts[spawnCountIndex(unitType)] || 0;
}

function decrementSpawnCount(counts, unitType) {
    const idx = spawnCountIndex(unitType);
    const next = counts.slice();
    next[idx] -= 1;
    return next;
}

function locationToXY(location, numPaths) {
    return {
        x: location % numPaths,
        y: Math.floor(location / numPaths)
    };
}

function xyToLocation(x, y, numPaths) {
    return (y * numPaths) + x;
}

function getPlacementsPath(node) {
    const placements = [];
    let current = node;
    while (current) {
        if (current instanceof PlacementNode) {
            placements.push(current.placement);
        }
        current = current.parent;
    }
    return placements.reverse();
}

function getBoardStateFromNode(node) {
    return getPlacementsPath(node).join('');
}

class GameState {
    constructor({ node, units = [], unitSpawnSourceCounts = null }) {
        this.node = node;
        this.units = units;
        this.unitSpawnSourceCounts = unitSpawnSourceCounts;
        this.boardState = getBoardStateFromNode(node);
    }

    getAllPlacements() {
        return getPlacementsPath(this.node);
    }

    getOccupiedLocations() {
        return new Set(this.units.map(u => u.location));
    }
}

function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

function multinomialCoefficient(counts) {
    const total = counts.reduce((sum, c) => sum + c, 0);
    let result = factorial(total);
    for (const count of counts) {
        result /= factorial(count);
    }
    return result;
}

function generateCountCombinations({ tileTypes, tileBag, numTilesToDraw }, tileIndex = 0, remainingDraws = numTilesToDraw, currentCounts = []) {
    if (tileIndex === tileTypes.length) {
        return remainingDraws === 0 ? [currentCounts] : [];
    }

    const results = [];
    const maxCanDraw = Math.min(remainingDraws, tileBag[tileTypes[tileIndex]]);
    for (let count = 0; count <= maxCanDraw; count++) {
        results.push(...generateCountCombinations(
            { tileTypes, tileBag, numTilesToDraw },
            tileIndex + 1,
            remainingDraws - count,
            [...currentCounts, count]
        ));
    }
    return results;
}

function uniquePermutations(tiles, targetLength) {
    function generatePermutations(remaining, current = []) {
        if (current.length === targetLength) {
            return [current];
        }

        const results = [];
        const used = new Set();
        for (let i = 0; i < remaining.length; i++) {
            const tile = remaining[i];
            if (used.has(tile)) continue;
            used.add(tile);

            const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
            results.push(...generatePermutations(newRemaining, [...current, tile]));
        }
        return results;
    }

    return generatePermutations(tiles);
}

class DefenseNode {
    constructor({ round, tileBag, parent = null }) {
        this.round = round;
        this.turn = playerEnum.DEFENSE;
        // Tile bag at the START of this defense round.
        this.tileBag = tileBag;
        this.potentialDraws = [];
        this.parent = parent;
    }

    getTileBagAtStart() {
        return this.tileBag;
    }

    static tileBagKey(tileBag) {
        return TILE_TYPE_ORDER.map(type => tileBag[type]).join('-');
    }

    static enumerateDrawCombinations(tileBag, numTilesToDraw) { 
        const tileTypes = Object.keys(tileBag);
        const totalTiles = Object.values(tileBag).reduce((sum, count) => sum + count, 0);

        const combinations = generateCountCombinations({ tileTypes, tileBag, numTilesToDraw });

        return combinations.map(counts => {
            let probability = 1;
            let tilesLeft = totalTiles;
            const bagCopy = { ...tileBag };

            for (let i = 0; i < tileTypes.length; i++) {
                const tileType = tileTypes[i];
                const drawCount = counts[i];
                for (let j = 0; j < drawCount; j++) {
                    probability *= bagCopy[tileType] / tilesLeft;
                    bagCopy[tileType]--;
                    tilesLeft--;
                }
            }

            probability *= multinomialCoefficient(counts);

            const combination = {};
            tileTypes.forEach((type, i) => {
                if (counts[i] > 0) combination[type] = counts[i];
            });

            return { combination, probability };
        });
    }

    static enumeratePlacements(combination, numLocations) {
        const tiles = [];
        for (const [tileType, count] of Object.entries(combination)) {
            for (let i = 0; i < count; i++) tiles.push(tileType);
        }

        if (tiles.length !== numLocations) {
            throw new Error(`Combination size (${tiles.length}) must match numLocations (${numLocations})`);
        }

        const permutations = uniquePermutations(tiles, numLocations);

        return permutations.map(placement => ({
            placement: placement.join(''),
            nextRound: null
        }));
    }

    toJSON() {
        return {
            t: 'DefenseNode',
            round: this.round,
            turn: this.turn,
            tileBag: this.tileBag,
            potentialDraws: this.potentialDraws
        };
    }
}

class DrawNode {
    constructor({ drawKey, drawProbability, randomPlacementProbability, parent }) {
        this.drawKey = drawKey;
        this.drawProbability = drawProbability;
        this.randomPlacementProbability = randomPlacementProbability;
        this.placementPermutations = [];
        this.parent = parent;
    }

    toJSON() {
        return {
            t: 'DrawNode',
            drawKey: this.drawKey,
            drawProbability: this.drawProbability,
            randomPlacementProbability: this.randomPlacementProbability,
            placementPermutations: this.placementPermutations
        };
    }

    static drawKey(combination) {
        return TILE_TYPE_ORDER.map(type => combination[type] || 0).join('-');
    }
}

class PlacementNode {
    constructor({ placement, parent }) {
        this.placement = placement;
        this.nextRound = null;
        this.parent = parent;
    }

    toJSON() {
        return {
            t: 'PlacementNode',
            placement: this.placement,
            nextRound: this.nextRound
        };
    }
}

class OffenseTurnNode {
    constructor({ round, gold, units = [], unitSpawnSourceCounts = null, parent }) {
        this.round = round;
        this.turn = playerEnum.OFFENSE;
        // Gold at the START of this offense turn.
        this.gold = gold;
        this.units = units;
        // Cached spawn source counts for this offense turn.
        this.unitSpawnSourceCounts = unitSpawnSourceCounts;
        this.turnActions = [];
        this.parent = parent;
    }

    getGoldAtStart() {
        return this.gold;
    }

    static enumerateActions({ gold, units, unitSpawnSourceCounts, numPaths, maxY }) {
        const results = [];

        const startUnits = cloneUnits(units);
        const startSourceCounts = cloneSpawnSourceCounts(unitSpawnSourceCounts);

        const getSpawnableStartLocations = (currentUnits) => {
            const occupied = new Set(currentUnits.map(u => u.location));
            const locations = [];
            for (let x = 0; x < numPaths; x++) {
                const loc = xyToLocation(x, 0, numPaths);
                if (!occupied.has(loc)) locations.push(loc);
            }
            return locations;
        };

        const getAvailableUnitTypesToSpawn = (counts) => {
            return UNIT_TYPE_ORDER.filter(t => getSpawnCount(counts, t) > 0);
        };

        const offenseWins = (currentUnits) => {
            if (typeof maxY !== 'number') return false;
            for (const u of currentUnits) {
                const { y } = locationToXY(u.location, numPaths);
                if (y === maxY) return true;
            }
            return false;
        };

        function dfs(currentGold, currentUnits, currentSourceCounts, actionList) {
            const didOffenseWin = offenseWins(currentUnits);

            results.push({
                actions: actionList,
                finalGold: currentGold,
                units: cloneUnits(currentUnits),
                unitSpawnSourceCounts: cloneSpawnSourceCounts(currentSourceCounts),
                win: didOffenseWin ? playerEnum.OFFENSE : null
            });

            if (didOffenseWin) return;

            const spawnLocations = getSpawnableStartLocations(currentUnits);
            const spawnTypes = getAvailableUnitTypesToSpawn(currentSourceCounts);

            for (const unitType of spawnTypes) {
                const price = unitCosts[unitType];
                if (price > currentGold) continue;
                if (spawnLocations.length === 0) continue;

                for (const location of spawnLocations) {
                    const nextGold = currentGold - price;
                    const nextUnits = cloneUnits(currentUnits);
                    nextUnits.push({ type: unitType, location });

                    const nextSourceCounts = decrementSpawnCount(currentSourceCounts, unitType);

                    dfs(nextGold, nextUnits, nextSourceCounts, [...actionList, { type: 'spawn', unitType, location }]);
                }
            }

            const MOVE_COST = 2;
            if (currentGold < MOVE_COST) return;
            if (currentUnits.length === 0) return;

            const occupied = new Set(currentUnits.map(u => u.location));
            const inBounds = (x, y) => x >= 0 && x < numPaths && y >= 0;
            const orthogonalDeltas = [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 }
            ];

            for (let i = 0; i < currentUnits.length; i++) {
                const unit = currentUnits[i];
                const { x, y } = locationToXY(unit.location, numPaths);

                for (const { dx, dy } of orthogonalDeltas) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (!inBounds(nx, ny)) continue;

                    const to = xyToLocation(nx, ny, numPaths);
                    if (occupied.has(to)) continue;

                    const nextUnits = cloneUnits(currentUnits);
                    nextUnits[i] = { ...nextUnits[i], location: to };

                    dfs(
                        currentGold - MOVE_COST,
                        nextUnits,
                        currentSourceCounts,
                        [...actionList, { type: 'move', unitIndex: i, from: unit.location, to }]
                    );
                }
            }
        }

        dfs(gold, startUnits, startSourceCounts, []);

        const seen = new Set();
        return results.filter(r => {
            const key = JSON.stringify({ a: r.actions, u: r.units.map(u => [u.type, u.location]), g: r.finalGold, w: r.win });
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    toJSON() {
        return {
            t: 'OffenseTurnNode',
            round: this.round,
            turn: this.turn,
            gold: this.gold,
            units: encodeUnits(this.units),
            unitSourceCounts: this.unitSpawnSourceCounts,
            turnActions: this.turnActions
        };
    }
}

class ActionNode {
    constructor({ actions, finalGold, units, nextRound, win = null, parent }) {
        this.actions = actions;
        this.finalGold = finalGold;
        this.units = units;
        this.nextRound = nextRound;
        this.win = win;
        this.parent = parent;
    }

    toJSON() {
        return {
            t: 'ActionNode',
            finalGold: this.finalGold,
            win: this.win,
            actions: this.actions,
            units: encodeUnits(this.units),
            nextRound: this.nextRound
        };
    }
}

function findNearestAncestor(node, predicate) {
    let current = node;
    while (current) {
        if (predicate(current)) return current;
        current = current.parent;
    }
    return null;
}

function getDefenseContext(node) {
    return findNearestAncestor(node, n => n && n.turn === playerEnum.DEFENSE);
}

function getOffenseContext(node) {
    return findNearestAncestor(node, n => n && n.turn === playerEnum.OFFENSE);
}

const logsDir = '.././logs';

// Clear logs folder at startup
if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
    console.log('Cleared previous logs');
}

// Global settings
const NUM_OF_PATHS = 2; //x
const STARTING_DEPTH = 2; //y start
const MAX_ROUNDS = 4;



const playerEnum = Object.freeze({
    OFFENSE: 'O',
    DEFENSE: 'D'
});

const tileBagEnum = Object.freeze({
    BLANK: 'B',
    SPIKE_TRAP: 'S',
    CAGE_TRAP: 'C',
    OIL_TRAP: 'O',
    PUSHBACK_TRAP: 'P'
});

const TILE_TYPE_ORDER = Object.values(tileBagEnum).sort();

// Initial game state
const initialTileBag = {
    [tileBagEnum.BLANK]: 4,
    [tileBagEnum.SPIKE_TRAP]: 2,
    [tileBagEnum.CAGE_TRAP]: 0,
    [tileBagEnum.OIL_TRAP]: 0,
    [tileBagEnum.PUSHBACK_TRAP]: 0
};

const initialUnitSpawnSourceCounts = getInitialSpawnSourceCounts();

function getUnitSpawnSourceCountsAt(node) {
    const offenseNode = findNearestAncestor(node, n => n && n.turn === playerEnum.OFFENSE);
    if (!offenseNode) return null;
    const base = cloneSpawnSourceCounts(offenseNode.unitSpawnSourceCounts);
    if (!base) return null;

    const chain = [];
    let current = node;
    while (current && current !== offenseNode) {
        chain.push(current);
        current = current.parent;
    }
    chain.reverse();

    let counts = base;
    for (const n of chain) {
        if (n instanceof ActionNode) {
            for (const a of (n.actions || [])) {
                if (a.type === 'spawn') {
                    counts = decrementSpawnCount(counts, a.unitType);
                }
            }
        }
    }

    return counts;
}

// Recursive function to build game tree
function buildGameTree(tileBag, round, offenseGold = 4, units = [], unitSpawnSourceCounts = initialUnitSpawnSourceCounts) {
    if (round > MAX_ROUNDS) {
        return null;
    }

    console.log(`\nProcessing round ${round}...`);

    // First round draws NUM_OF_PATHS * STARTING_DEPTH, subsequent rounds draw NUM_OF_PATHS
    const numTilesToDraw = round === 1 ? NUM_OF_PATHS * STARTING_DEPTH : NUM_OF_PATHS;
    // Board max Y index for the board *after* this defense placement.
    // Round 1 placement fills STARTING_DEPTH rows; each subsequent defense adds one row.
    const maxYAfterPlacement = (STARTING_DEPTH - 1) + (round - 1);

    const drawCombinations = DefenseNode.enumerateDrawCombinations(tileBag, numTilesToDraw);

    const defenseNode = new DefenseNode({
        round,
        tileBag: DefenseNode.tileBagKey(tileBag)
    });

    const potentialDraws = drawCombinations.map(({ combination, probability }, index) => {
        console.log(`  Round ${round} - Combination ${index + 1}/${drawCombinations.length}:`, combination, `(probability: ${probability})`);

        const placementPermutationsRaw = DefenseNode.enumeratePlacements(combination, numTilesToDraw);
        console.log(`    Found ${placementPermutationsRaw.length} unique arrangements`);

        // Calculate remaining tiles in bag after this draw
        const remainingTileBag = { ...tileBag };
        for (const [tileType, count] of Object.entries(combination)) {
            remainingTileBag[tileType] -= count;
        }

        // Generate all possible offense actions for this round
        const offenseActions = OffenseTurnNode.enumerateActions({
            gold: offenseGold,
            units,
            unitSpawnSourceCounts,
            numPaths: NUM_OF_PATHS,
            maxY: maxYAfterPlacement
        });

        const drawNode = new DrawNode({
            drawKey: DrawNode.drawKey(combination),
            drawProbability: probability,
            randomPlacementProbability: 1 / placementPermutationsRaw.length,
            parent: defenseNode
        });

        drawNode.placementPermutations = placementPermutationsRaw.map(p => new PlacementNode({
            placement: p.placement,
            parent: drawNode
        }));

        // Recursively build next round for each placement
        drawNode.placementPermutations.forEach(placementNode => {
            const gameState = new GameState({
                node: placementNode,
                units,
                unitSpawnSourceCounts
            });

            const offenseNode = new OffenseTurnNode({
                round,
                gold: offenseGold,
                units: cloneUnits(gameState.units),
                unitSpawnSourceCounts: cloneSpawnSourceCounts(gameState.unitSpawnSourceCounts),
                parent: placementNode
            });

            offenseNode.turnActions = offenseActions.map(action => new ActionNode({
                actions: action.actions,
                finalGold: action.finalGold,
                units: action.units,
                win: action.win,
                nextRound: action.win === playerEnum.OFFENSE ? null : buildGameTree(remainingTileBag, round + 1, action.finalGold + 1, action.units, action.unitSpawnSourceCounts),
                parent: offenseNode
            }));

            placementNode.nextRound = offenseNode;
        });

        return drawNode;
    });

    defenseNode.potentialDraws = potentialDraws;
    return defenseNode;
}

function printGameAnalysis(gameAnalysis, indent = '') {
    if (!gameAnalysis) return;

    // Save gameAnalysis to file
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const filename = `${logsDir}/game_analysis.json`;
    if (fs.existsSync(filename)) {
        fs.rmSync(filename, { force: true });
    }
    fs.writeFileSync(filename, JSON.stringify(gameAnalysis, null, 2), 'utf8');
    console.log(`\nGame analysis saved to ${filename}`);
}



console.log('DungeonQuest Analyzer');
console.log(`Paths: ${NUM_OF_PATHS}, Starting Depth: ${STARTING_DEPTH}, Max Rounds: ${MAX_ROUNDS}`);

const gameAnalysis = buildGameTree(initialTileBag, 1);

printGameAnalysis(gameAnalysis);
