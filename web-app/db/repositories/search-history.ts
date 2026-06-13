import 'server-only'

import { eq, desc } from 'drizzle-orm'
import db from '../connection'
import { searchHistory, type SearchHistory } from '../schema'

export async function addSearchHistory(data: {
  userId: string
  query: string
  resultCount: number
}): Promise<void> {
  await db.insert(searchHistory).values(data)
}

export async function getSearchHistory(
  userId: string,
  limit: number = 10
): Promise<SearchHistory[]> {
  return db
    .select()
    .from(searchHistory)
    .where(eq(searchHistory.userId, userId))
    .orderBy(desc(searchHistory.createdAt))
    .limit(limit)
}

export async function clearSearchHistory(userId: string): Promise<void> {
  await db.delete(searchHistory).where(eq(searchHistory.userId, userId))
}
