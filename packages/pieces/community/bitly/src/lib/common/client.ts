import { HttpMethod, httpClient } from '@activepieces/pieces-common';

export const BASE_URL = `https://api-ssl.bitly.com/v4`;

export async function makeRequest(
  api_key: string,
  method: HttpMethod,
  path: string,
  body?: unknown,
  headers?: Record<string, string> | string
) {
  try {
    const response = await httpClient.sendRequest({
      method,
      url: `${BASE_URL}${path}`,
      headers: {
        Authorization: `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    return response.body;
  } catch (error: any) {
    throw new Error(`Unexpected error: ${error.message || String(error)}`);
  }
}
