import { geocodeAddress, reverseGeocode } from '@/lib/google-maps'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (lat && lng) {
    const result = await reverseGeocode(Number(lat), Number(lng))
    if (!result) {
      return Response.json({ error: 'Could not resolve an address for that location' }, { status: 404 })
    }
    return Response.json(result)
  }

  const address = searchParams.get('address') ?? ''
  const result = await geocodeAddress(address)

  if (!result) {
    return Response.json({ error: 'Could not geocode address' }, { status: 404 })
  }

  return Response.json(result)
}
