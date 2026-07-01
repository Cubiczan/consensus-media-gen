import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    const where = status ? { status } : {};

    const [jobs, total] = await Promise.all([
      db.generationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
        include: {
          candidates: {
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: { events: true, assets: true },
          },
        },
      }),
      db.generationJob.count({ where }),
    ]);

    return NextResponse.json({ jobs, total, limit, offset });
  } catch (error) {
    console.error('[Jobs API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}