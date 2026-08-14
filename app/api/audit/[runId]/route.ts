import { NextRequest, NextResponse } from 'next/server';
import { getRun } from 'workflow/api';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  try {
    const run = await getRun(runId);
    const status = await run.status;
    if (status === 'completed') {
      const result = await run.returnValue;
      return NextResponse.json({ status, result }, { headers:{'Cache-Control':'no-store'} });
    }
    if (status === 'failed' || status === 'cancelled') {
      return NextResponse.json({ status, error:'The audit stopped before it could finish. Please try again.' }, { status:422, headers:{'Cache-Control':'no-store'} });
    }
    return NextResponse.json({ status }, { status:202, headers:{'Cache-Control':'no-store'} });
  } catch {
    return NextResponse.json({ error:'This audit run could not be found.' }, { status:404, headers:{'Cache-Control':'no-store'} });
  }
}
