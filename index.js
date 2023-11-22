// ==UserScript==
// @name        Canvas Grade Calculator
// @description Calculate grade totals for Canvas courses that have it disabled.
// @namespace   https://github.com/uncenter/canvas-grade-calculator
// @match       https://*.instructure.com/courses/*/grades
// @grant       none
// @downloadURL https://github.com/uncenter/canvas-grade-calculator/raw/main/index.js
// @homepageURL https://github.com/uncenter/canvas-grade-calculator
// @version     0.2.2
// @author      uncenter
// @license     MIT
// ==/UserScript==

function calculate() {
	if (!document.querySelector('.ic-app-main-content')) {
		console.error('Not on Canvas!');
		return;
	}

	if (!document.querySelector('#grade-summary-content')) {
		console.error('Not on grades page!');
		return;
	}

	const weights = {};

	// Scrape weights table for category/group names and percentages.
	for (const element of document.querySelectorAll(
		'[aria-label="Assignment Weights"] > table tbody > tr'
	)) {
		const group = element.querySelector('th').textContent;
		if (group === 'Total') continue;
		const weight =
			Number.parseFloat(element.querySelector('td').textContent.slice(0, 2)) /
			100;
		weights[group] = weight;
	}

	const assignments = [];

	// Scrape assignments table for graded assignments.
	for (const element of document.querySelectorAll(
		'#grades_summary tr.assignment_graded.student_assignment'
	)) {
		let earned, available, title, group;

		const a = element.querySelector('th.title');
		title = a.querySelector('a').textContent;
		group = a.querySelector('div.context').textContent;

		const grades = element.querySelector(
			'td.assignment_score > div > span.tooltip > span.grade'
		);

		const score = [...grades.childNodes]
			.find(
				(node) =>
					node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
			)
			?.textContent.trim();

		if (
			score.includes('%') ||
			!grades.nextElementSibling.textContent.includes('/')
		) {
			earned = Number.parseFloat(score.replace('%', ''));
			available = 100;
		} else {
			earned = Number.parseFloat(score);
			if (typeof earned !== 'number' || Number.isNaN(earned)) continue;

			available = Number.parseFloat(
				grades.nextElementSibling.textContent.replace('/', '').trim()
			);
		}

		assignments.push({ earned, available, title, group });
	}

	if (assignments.length === 0) {
		console.warn('No graded assignments found!');
		return;
	}

	/* eslint-disable unicorn/prevent-abbreviations, unicorn/no-array-reduce */
	// Convert assignments array into an object of type { [category]: { totalEarned: number, totalAvailable: number }].
	const totalsPerGroup = assignments.reduce(
		(acc, { group, earned, available }) => {
			acc[group] = acc[group] || { totalEarned: 0, totalAvailable: 0 };
			acc[group].totalEarned += earned;
			acc[group].totalAvailable += available;
			return acc;
		},
		{}
	);
	/* eslint-enable */

	// Convert available out of total for each group into percentage values.
	const groupPercentages = {};
	for (const group in totalsPerGroup) {
		const { totalEarned, totalAvailable } = totalsPerGroup[group];
		groupPercentages[group] = (totalEarned / totalAvailable) * 100 || undefined;
	}

	let grade = 0;
	if (Object.entries(weights).length === 0) {
		// No weights, so we can just take total earned and available combined from all groups and get the percentage.
		console.log('Assignment groups / categories are not weighted.');
		let totalAvailable = 0;
		let totalEarned = 0;
		for (const group of Object.values(totalsPerGroup)) {
			totalEarned += group.totalEarned;
			totalAvailable += group.totalAvailable;
		}
		grade = (totalEarned / totalAvailable) * 100;
	} else {
		// Weights, so multiply each group's percentage by that group's weight and add to total, while keeping in mind that with some groups lacking assignments not all weights will be used (so use sum of weights given as denominator).
		let totalWeights = 0;
		for (const group in groupPercentages) {
			grade += groupPercentages[group] * weights[group];
			totalWeights += weights[group];
		}
		grade = grade / totalWeights;
	}

	return { grade: grade.toFixed(2), assignments };
}

function apply(grade) {
	// Replace the "Calculation of totals has been disabled" message with the calculated grade.
	(
		document.querySelector('#student-grades-final') ||
		document.querySelector('.student_assignment.final_grade')
	).outerHTML = `<div class="student_assignment final_grade">Total: <span class="grade">${grade}%</span></div>`;
}

function log({ grade, assignments }) {
	console.log(`${grade}% across ${assignments.length} graded assignments.`);
}

function run() {
	const result = calculate();
	if (result) {
		log(result);
		apply(result.grade);
	}
}

if (document.querySelector('#student-grades-final')) {
	const observer = new MutationObserver(run);

	observer.observe(document.querySelector('#grades_summary'), {
		childList: true,
		subtree: true,
	});

	run();
} else {
	const result = calculate();
	if (result) log(result);
}
