import { logDrawProbabilities } from './logger.js';

const playerEnum = Object.freeze({
    OFFENSE: 'OFFENSE',
    DEFENSE: 'DEFENSE'
});

const tileBagEnum = Object.freeze({
    BLANK: 'BLANK',
    SPIKE_TRAP: 'SPIKE_TRAP',
    CAGE_TRAP: 'CAGE_TRAP',
    OIL_TRAP: 'OIL_TRAP',
    PUSHBACK_TRAP: 'PUSHBACK_TRAP'
});

export function newGameBoard(settings) {
    const playerTurn = playerEnum.DEFENSE;
    const paths = Array.from({ length: settings.numOfPaths }, () => []);
    const tileBag = {
        [tileBagEnum.BLANK]: 10,
        [tileBagEnum.SPIKE_TRAP]: 5,
        [tileBagEnum.CAGE_TRAP]: 0,
        [tileBagEnum.OIL_TRAP]: 0,
        [tileBagEnum.PUSHBACK_TRAP]: 0
    }

    return {
        playerTurn,
        round: 1,
        paths,
        tileBag,
        moveHistory: []
    }
}

export function drawTilesFromBagProbabilityDistribution(gameBoard, numTilesToDraw) {
    const tileTypes = Object.keys(gameBoard.tileBag);
    const totalTiles = Object.values(gameBoard.tileBag).reduce((sum, count) => sum + count, 0);

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
        const maxCanDraw = Math.min(remainingDraws, gameBoard.tileBag[tileTypes[tileIndex]]);

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
        const bagCopy = { ...gameBoard.tileBag };

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

    logDrawProbabilities(gameBoard.round, probabilities);

    return probabilities;
}

export function calcTileLocationPermutations(combination, numLocations) {
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

    // Generate all unique permutations
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
    const totalPermutations = permutations.length;

    // Each unique permutation has equal probability (random slotting)
    const probability = 1 / totalPermutations;

    return permutations;
}




