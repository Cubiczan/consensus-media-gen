import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const job = await db.generationJob.findUnique({
      where: { id },
      include: {
        candidates: {
          orderBy: { createdAt: 'asc' },
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
        assets: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('[Job Detail API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}