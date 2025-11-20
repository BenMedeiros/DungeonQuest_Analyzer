import fs from 'fs';
import path from 'path';

const LOG_DIR = './logs';

// Ensure log directory exists
function ensureLogDir(subDir = '') {
    const dir = subDir ? path.join(LOG_DIR, subDir) : LOG_DIR;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

export function logDrawProbabilities(round, probabilities) {
    const roundDir = ensureLogDir(`round_${round}`);
    
    const filename = path.join(roundDir, `draw_probabilities.json`);
    const content = JSON.stringify(probabilities, null, 2);
    
    fs.writeFileSync(filename, content, 'utf8');
    console.log(`Round ${round} draw probabilities logged to ${filename}`);
}

export function logCombination(round, combinationObj, index) {
    const roundDir = ensureLogDir(`round_${round}`);
    
    // Create a filename based on the combination
    const filename = path.join(roundDir, `combination_${index}.json`);
    const content = JSON.stringify(combinationObj, null, 2);
    
    fs.writeFileSync(filename, content, 'utf8');
    console.log(`Round ${round} combination ${index} logged to ${filename}`);
}
