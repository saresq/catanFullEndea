import { createDice } from '../models/dice.js';

const modeArg = process.argv[2];
const mode = modeArg === '-r' ? 'random' : 'balanced';
const modeLabel = mode === 'random' ? 'Random' : 'Balanced';

function runTest(rollsCount) {
    console.log(`--- Running test with ${rollsCount} rolls ---`);
    const dice = createDice(mode);
    const results = {};
    for (let i = 2; i <= 12; i++) results[i] = 0;

    let totalConsecutive = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    let lastTotal = null;

    for (let i = 0; i < rollsCount; i++) {
        const { d1, d2 } = dice.roll();
        const total = d1 + d2;
        results[total]++;

        if (total === lastTotal) {
            totalConsecutive++;
            currentStreak++;
        } else {
            currentStreak = 1;
        }

        if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
        }
        lastTotal = total;
    }

    console.log('Roll counts for each total:');
    const sortedTotals = Object.keys(results).sort((a, b) => a - b);
    for (const total of sortedTotals) {
        const count = results[total];
        const percentage = ((count / rollsCount) * 100).toFixed(2);
        console.log(`Total ${total.toString().padStart(2)}: ${count.toString().padStart(3)} rolls (${percentage.padStart(5)}%)`);
    }

    console.log(`Streak count: ${totalConsecutive}`);
    console.log(`Longest streak: ${maxStreak}`);
    console.log('\n');
}

console.log(`Testing ${modeLabel} Dice Implementation\n`);
runTest(30);
runTest(60);
runTest(150);
