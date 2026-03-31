/**
 * Shared CORS configuration for all Edge Functions
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(): Response {
  return new Response('ok', {
    status: 200,
    headers: corsHeaders,
  })
}

/**
 * Create response with CORS headers
 */
export function createCorsResponse(
  body: string | null,
  init?: ResponseInit
): Response {
  return new Response(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init?.headers || {}),
    },
  })
}
