import { geocodeAddress } from '@/lib/google-maps'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') ?? ''

  const result = await geocodeAddress(address)

  if (!result) {
    return Response.json({ error: 'Could not geocode address' }, { status: 404 })
  }

  return Response.json(result)
}
