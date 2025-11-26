const PROFANITY_LIST = ['badword', 'profane']; // Placeholder list

export class Leaderboard extends Resource {
	// Allow public read access (anyone can view the leaderboard)
	allowRead() {
		return true;
	}

	// Allow public write access (anyone can submit scores)
	allowCreate() {
		return true;
	}

	async get() {
		// Return top 10 scores
		// Use search() to get all records from ScoreEntry table
		const scores = await tables.ScoreEntry.search({
			// Get all records, no filter
		});

		// Convert async iterable to array
		const scoresArray = [];
		for await (const score of scores) {
			scoresArray.push(score);
		}

		// Sort: Score DESC, Level DESC, Time ASC, Date ASC
		scoresArray.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			if (b.levelReached !== a.levelReached) return b.levelReached - a.levelReached;
			if (a.totalTimeSeconds !== b.totalTimeSeconds) return a.totalTimeSeconds - b.totalTimeSeconds;
			// Use new Date() for string comparison safety
			return new Date(a.createdAt) - new Date(b.createdAt);
		});

		return scoresArray.slice(0, 10);
	}

	async post(data) {
		// console.log('Submitting score:', data); // Debug log (server-side logs appear in terminal)
		// Validate and sanitize
		let { playerName, score, levelReached, coinsCollected, totalTimeSeconds } = data;

		if (!playerName) playerName = "Anonymous Pilgrim";

		// Simple profanity filter
		const lowerName = playerName.toLowerCase();
		for (const word of PROFANITY_LIST) {
			if (lowerName.includes(word)) {
				playerName = `Friendly Pilgrim ${Math.floor(Math.random() * 10000)}`;
				break;
			}
		}

		const entry = {
			playerName,
			score: Number(score),
			levelReached: Number(levelReached),
			coinsCollected: Number(coinsCollected),
			totalTimeSeconds: Number(totalTimeSeconds),
			createdAt: new Date().toISOString(),
			// Store local date (YYYY-MM-DD) to simplify "runs today" queries
			localDate: new Date().toLocaleDateString('en-CA'),
			id: crypto.randomUUID()
		};

		await tables.ScoreEntry.put(entry);

		return { success: true, message: 'Score submitted!' };
	}
}

export class SessionCount extends Resource {
	// Allow public read access (anyone can view session count)
	allowRead() {
		return true;
	}

	async get() {
		// Count total sessions
		// For scalability, we might want to cache this or maintain a counter.
		// For now, iterating is safe for small datasets.
		let count = 0;
		for (const _ of tables.GameSession) {
			count++;
		}
		return { totalSessions: count };
	}
}

// Real-time Presence
// ... (omitted comments)

export class ActiveCountAPI extends Resource {
	// Allow public read access (anyone can view active browser count)
	allowRead() {
		return true;
	}

	// Allow public write access (anyone can increment/decrement active count)
	allowCreate() {
		return true;
	}

	async get() {
		const counter = await tables.ActiveCount.get('global');
		return {
			activeCount: counter ? counter.count : 0
		};
	}

	async post(data) {
		const { action } = data;
		let counter = await tables.ActiveCount.get('global');
		if (!counter) {
			await tables.ActiveCount.put({
				id: 'global',
				count: action === 'increment' ? 1 : 0
			});
		} else {
			const newCount = action === 'increment'
				? (counter.count || 0) + 1
				: Math.max(0, (counter.count || 0) - 1);

			await tables.ActiveCount.put({
				id: 'global',
				count: newCount
			});
		}
		return this.get();
	}
}

export class PlayerStats extends Resource {
	// Allow public read access (anyone can view player statistics)
	allowRead() {
		return true;
	}

	async get(query) {
		const { playerName } = query;
		if (!playerName) return { count: 0 };

		// Get today's local date (YYYY-MM-DD format)
		const localDateToday = new Date().toLocaleDateString('en-CA');

		let count = 0;

		// Use search with condition for efficiency
		// We filter by playerName at DB level, then check localDate
		const scores = await tables.ScoreEntry.search({
			conditions: [
				{ attribute: 'playerName', value: playerName, comparator: 'equals' }
			]
		});

		for await (const score of scores) {
			// Check if localDate matches today
			// Fallback: if localDate is missing (old records), calculate it from createdAt
			const recordDate = score.localDate || new Date(score.createdAt).toLocaleDateString('en-CA');

			if (recordDate === localDateToday) {
				count++;
			}
		}

		return { count };
	}
}