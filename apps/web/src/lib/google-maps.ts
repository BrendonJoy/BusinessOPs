const API_KEY = process.env.GOOGLE_MAPS_API_KEY

export type AddressSuggestion = {
  placeId: string
  description: string
}

export type PlaceDetails = {
  formattedAddress: string
  lat: number
  lng: number
}

export async function autocompleteAddress(
  input: string,
  sessionToken: string
): Promise<AddressSuggestion[]> {
  if (!API_KEY || !input.trim()) return []

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', input)
  url.searchParams.set('sessiontoken', sessionToken)
  url.searchParams.set('key', API_KEY)

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  if (data.status !== 'OK') return []

  return (data.predictions ?? []).map((p: { place_id: string; description: string }) => ({
    placeId: p.place_id,
    description: p.description,
  }))
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken: string
): Promise<PlaceDetails | null> {
  if (!API_KEY || !placeId) return null

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'formatted_address,geometry')
  url.searchParams.set('sessiontoken', sessionToken)
  url.searchParams.set('key', API_KEY)

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  if (data.status !== 'OK' || !data.result) return null

  return {
    formattedAddress: data.result.formatted_address,
    lat: data.result.geometry.location.lat,
    lng: data.result.geometry.location.lng,
  }
}

/** NxN matrix of travel time in seconds between the given points, or null if unavailable. */
export async function getDistanceMatrix(
  points: { lat: number; lng: number }[]
): Promise<number[][] | null> {
  if (!API_KEY || points.length < 2) return null

  const locations = points.map((p) => `${p.lat},${p.lng}`).join('|')
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', locations)
  url.searchParams.set('destinations', locations)
  url.searchParams.set('key', API_KEY)

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  if (data.status !== 'OK') return null

  return data.rows.map((row: { elements: { status: string; duration?: { value: number } }[] }) =>
    row.elements.map((el) => (el.status === 'OK' && el.duration ? el.duration.value : Infinity))
  )
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!API_KEY || !address.trim()) return null

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('key', API_KEY)

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.[0]) return null

  const location = data.results[0].geometry.location
  return { lat: location.lat, lng: location.lng }
}
