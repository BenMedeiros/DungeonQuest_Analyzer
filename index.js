import {
    newGameBoard,
    drawTilesFromBagProbabilityDistribution,
    calcTileLocationPermutations
} from './gameBoardState.js';
import { logCombination } from './logger.js';
import fs from 'fs';

// Clear logs folder at startup
if (fs.existsSync('./logs')) {
    fs.rmSync('./logs', { recursive: true, force: true });
    console.log('Cleared previous logs');
}

const settings = {
    numOfPaths: 3,
    startingDepth: 2
};

console.log('DungeonQuest Analyzer');
console.log('Starting depth:', settings);

const gameBoard = newGameBoard(settings);

const numTilesToDraw = gameBoard.paths.length * settings.startingDepth;
const initialDefenseMoves = drawTilesFromBagProbabilityDistribution(gameBoard, numTilesToDraw);

// Calculate arrangements for each combination
initialDefenseMoves.forEach(({ combination, probability }, index) => {
    console.log(`\nProcessing combination:`, combination, `(probability: ${probability})`);
    const permutations = calcTileLocationPermutations(combination, numTilesToDraw);
    console.log(`  Found ${permutations.length} unique arrangements`);
    
    // Log the complete combination object with its placement permutations
    const combinationObj = {
        combination,
        drawProbability: probability,
        randomPlacementProbability: 1 / permutations.length,
        placementPermutations: permutations
    };
    logCombination(gameBoard.round, combinationObj, index);
});

