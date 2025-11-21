import fs from 'fs';

// Clear logs folder at startup
if (fs.existsSync('./logs')) {
    fs.rmSync('./logs', { recursive: true, force: true });
    console.log('Cleared previous logs');
}

// Global settings
const NUM_OF_PATHS = 3;
const STARTING_DEPTH = 2;
const MAX_ROUNDS = 3;

const playerEnum = Object.freeze({
    OFFENSE: 'OFFENSE',
    DEFENSE: 'DEFENSE'
});

const tileBagEnum = Object.freeze({
    BLANK: 'B',
    SPIKE_TRAP: 'S',
    CAGE_TRAP: 'C',
    OIL_TRAP: 'O',
    PUSHBACK_TRAP: 'P'
});

// Initial game state
const initialTileBag = {
    [tileBagEnum.BLANK]: 10,
    [tileBagEnum.SPIKE_TRAP]: 2,
    [tileBagEnum.CAGE_TRAP]: 0,
    [tileBagEnum.OIL_TRAP]: 0,
    [tileBagEnum.PUSHBACK_TRAP]: 0
};

function drawTilesFromBagProbabilityDistribution(tileBag, numTilesToDraw) {
    const tileTypes = Object.keys(tileBag);
    const totalTiles = Object.values(tileBag).reduce((sum, count) => sum + count, 0);

    // Calculate factorial
    function factorial(n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }

    // Calculate multinomial coefficient: n! / (k1! * k2! * ... * km!)
    function multinomialCoefficient(counts) {
        const n = counts.reduce((sum, c) => sum + c, 0);
        let result = factorial(n);
        for (const count of counts) {
            result /= factorial(count);
        }
        return result;
    }

    // Generate all possible count combinations directly
    function generateCountCombinations(tileIndex = 0, remainingDraws = numTilesToDraw, currentCounts = []) {
        // Base case: we've assigned counts to all tile types
        if (tileIndex === tileTypes.length) {
            return remainingDraws === 0 ? [currentCounts] : [];
        }

        const results = [];
        const maxCanDraw = Math.min(remainingDraws, tileBag[tileTypes[tileIndex]]);

        // Try drawing 0 to maxCanDraw of this tile type
        for (let count = 0; count <= maxCanDraw; count++) {
            results.push(...generateCountCombinations(
                tileIndex + 1,
                remainingDraws - count,
                [...currentCounts, count]
            ));
        }

        return results;
    }

    const combinations = generateCountCombinations();

    // Calculate probability for each combination
    const probabilities = combinations.map(counts => {
        // Calculate base probability (drawing without replacement)
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

        // Multiply by multinomial coefficient (number of ways to arrange this combination)
        probability *= multinomialCoefficient(counts);

        // Convert counts array to object for readable output
        const combination = {};
        tileTypes.forEach((type, i) => {
            if (counts[i] > 0) {
                combination[type] = counts[i];
            }
        });

        return {
            combination,
            probability
        };
    });

    return probabilities;
}

function calcTileLocationPermutations(combination, numLocations) {
    // Convert combination object to array of tiles
    const tiles = [];
    for (const [tileType, count] of Object.entries(combination)) {
        for (let i = 0; i < count; i++) {
            tiles.push(tileType);
        }
    }

    if (tiles.length !== numLocations) {
        throw new Error(`Combination size (${tiles.length}) must match numLocations (${numLocations})`);
    }

    // Generate all unique permutations as objects
    function generatePermutations(remaining, current = []) {
        if (current.length === numLocations) {
            return [current];
        }

        const results = [];
        const used = new Set();

        for (let i = 0; i < remaining.length; i++) {
            const tile = remaining[i];

            // Skip duplicates at this position
            if (used.has(tile)) continue;
            used.add(tile);

            const newRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
            results.push(...generatePermutations(newRemaining, [...current, tile]));
        }

        return results;
    }

    const permutations = generatePermutations(tiles);
    
    // Convert permutations to objects with placement string and nextRound
    return permutations.map(placement => ({
        placement: placement.join(''),  // Concat to string without separator
        nextRound: null  // Will be populated recursively
    }));
}

// Helper function to convert tileBag object to concise string (e.g., "10-5-0-0-0")
function tileBagToString(tileBag) {
    const tileTypes = Object.keys(tileBag).sort();
    return tileTypes.map(type => tileBag[type]).join('-');
}

// Helper function to convert combination object to concise string (e.g., "4-2-0-0-0" for 4 BLANK, 2 SPIKE_TRAP)
function combinationToString(combination) {
    const tileTypes = Object.keys(initialTileBag).sort();
    return tileTypes.map(type => combination[type] || 0).join('-');
}

// Recursive function to build game tree
function buildGameTree(tileBag, round) {
    if (round > MAX_ROUNDS) {
        return null;
    }

    console.log(`\nProcessing round ${round}...`);
    
    // First round draws NUM_OF_PATHS * STARTING_DEPTH, subsequent rounds draw NUM_OF_PATHS
    const numTilesToDraw = round === 1 ? NUM_OF_PATHS * STARTING_DEPTH : NUM_OF_PATHS;
    
    const drawCombinations = drawTilesFromBagProbabilityDistribution(tileBag, numTilesToDraw);
    
    const potentialDraws = drawCombinations.map(({ combination, probability }, index) => {
        console.log(`  Round ${round} - Combination ${index + 1}/${drawCombinations.length}:`, combination, `(probability: ${probability})`);
        
        const placementPermutations = calcTileLocationPermutations(combination, numTilesToDraw);
        console.log(`    Found ${placementPermutations.length} unique arrangements`);
        
        // Calculate remaining tiles in bag after this draw
        const remainingTileBag = { ...tileBag };
        for (const [tileType, count] of Object.entries(combination)) {
            remainingTileBag[tileType] -= count;
        }
        
        // Recursively build next round for each placement
        placementPermutations.forEach(permutation => {
            permutation.nextRound = buildGameTree(remainingTileBag, round + 1);
        });
        
        return {
            combination: combinationToString(combination),
            drawProbability: probability,
            randomPlacementProbability: 1 / placementPermutations.length,
            placementPermutations
        };
    });
    
    return {
        round,
        tileBag: tileBagToString(tileBag),
        potentialDraws
    };
}

console.log('DungeonQuest Analyzer');
console.log(`Paths: ${NUM_OF_PATHS}, Starting Depth: ${STARTING_DEPTH}, Max Rounds: ${MAX_ROUNDS}`);

const gameAnalysis = buildGameTree(initialTileBag, 1);

// Save gameAnalysis to file
if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
}
const filename = `./logs/game_analysis.json`;
fs.writeFileSync(filename, JSON.stringify(gameAnalysis, null, 2), 'utf8');
console.log(`\nGame analysis saved to ${filename}`);

