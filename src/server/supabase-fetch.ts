const CLOCK_ERROR_CODE = "PGRST303";
const RETRY_DELAYS_MS = [1000, 2000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isTokenClockError(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  return body?.code === CLOCK_ERROR_CODE && /issued at future/i.test(String(body?.message));
}

/**
 * O PostgREST às vezes recusa um token recém-renovado, com "JWT issued at future", e aceita o mesmo
 * token instantes depois. A recusa vem antes de qualquer SQL, então repetir é seguro até em escrita.
 */
export function createClockTolerantFetch(baseFetch: typeof fetch = fetch, delays: number[] = RETRY_DELAYS_MS): typeof fetch {
  return async (input, init) => {
    let response = await baseFetch(input, init);
    for (const delay of delays) {
      if (!(await isTokenClockError(response))) return response;
      await wait(delay);
      response = await baseFetch(input, init);
    }
    return response;
  };
}
