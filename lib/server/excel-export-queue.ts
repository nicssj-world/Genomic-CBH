let exportQueue = Promise.resolve()

export function queueExcelExport<T>(run: () => Promise<T>) {
  const currentExport = exportQueue.then(run)
  exportQueue = currentExport.then(() => undefined, () => undefined)
  return currentExport
}
