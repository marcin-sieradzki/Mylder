// Node's file reads, which only the server's timetable and recordings use; the worker reads its
// timetable over the network instead, so a read here is a mistake worth stopping for.
const noFiles = async (): Promise<never> => {
  throw new Error('The demo tracker has no file system')
}

export const readFile = noFiles
export const readdir = noFiles
