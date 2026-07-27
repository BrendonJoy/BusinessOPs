import { getPlaceDetails } from '@/lib/google-maps'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const placeId = searchParams.get('placeId') ?? ''
  const sessionToken = searchParams.get('sessionToken') ?? ''

  const details = await getPlaceDetails(placeId, sessionToken)

  if (!details) {
    return Response.json({ error: 'Place not found' }, { status: 404 })
  }

  return Response.json(details)
}
