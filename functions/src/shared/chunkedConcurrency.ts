/**
 * `items`를 `concurrency`명씩 청크로 나눠 순차적으로 처리한다(research.md §15 — `batchGrade`가
 * 최대 100명 × 문항 5개 = 500회 Grader 호출을 한 요청 안에서 감당하기 위한 잠정 동시성 상한).
 */
export async function processInChunks<T, R>(
  items: T[],
  concurrency: number,
  process: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(chunk.map(process))));
  }
  return results;
}
