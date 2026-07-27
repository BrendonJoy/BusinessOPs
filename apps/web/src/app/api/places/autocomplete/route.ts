import { autocompleteAddress } from '@/lib/google-maps'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const input = searchParams.get('input') ?? ''
  const sessionToken = searchParams.get('sessionToken') ?? ''

  const suggestions = await autocompleteAddress(input, sessionToken)

  return Response.json({ suggestions })
}
