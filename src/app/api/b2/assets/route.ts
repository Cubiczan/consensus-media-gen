import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getImageLocal } from '@/lib/image-gen';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // Serve a specific image by key
      const imageData = getImageLocal(decodeURIComponent(key));
      if (imageData) {
        return new NextResponse(
          Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64'),
          {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=86400',
            },
          }
        );
      }
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // List all assets
    const assets = await db.b2Asset.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: {
          select: { modelName: true, status: true },
        },
      },
    });

    const stats = {
      totalAssets: assets.length,
      totalSize: assets.reduce((sum, a) => sum + a.size, 0),
      winnerAssets: assets.filter(a => a.isWinner).length,
    };

    return NextResponse.json({ assets, stats });
  } catch (error) {
    console.error('[B2 Assets API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}