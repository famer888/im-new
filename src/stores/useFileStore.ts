import { defineStore } from 'pinia'
import { ref } from 'vue'

function isTauri(): boolean {
  return !!(window as any).__TAURI_INTERNALS__
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export interface FileTask {
  id: string
  msgId: string
  fileName: string
  fileSize: number
  progress: number
  status: 'pending' | 'uploading' | 'downloading' | 'decrypting' | 'done' | 'error'
  error?: string
  localPath?: string
}

export const useFileStore = defineStore('file', () => {
  const tasks = ref<Map<string, FileTask>>(new Map())

  function getTask(msgId: string): FileTask | undefined {
    return tasks.value.get(msgId)
  }

  async function uploadFile(uid: string, filePath: string, fileName: string): Promise<{ url: string; fileKey: string }> {
    if (!isTauri()) return { url: '', fileKey: '' }
    const taskId = crypto.randomUUID()
    tasks.value.set(taskId, {
      id: taskId,
      msgId: '',
      fileName,
      fileSize: 0,
      progress: 0,
      status: 'uploading',
    })

    try {
      const result = await tauriInvoke<{ url: string; fileKey: string; fileSize: number }>('upload_file', {
        filePath,
        uid,
      })
      const task = tasks.value.get(taskId)
      if (task) {
        task.progress = 1
        task.status = 'done'
      }
      return { url: result.url, fileKey: result.fileKey }
    } catch (e) {
      const task = tasks.value.get(taskId)
      if (task) {
        task.status = 'error'
        task.error = String(e)
      }
      throw e
    }
  }

  async function downloadFile(msgId: string, url: string, fileKey: string, savePath: string, fileName: string) {
    if (!isTauri()) return
    tasks.value.set(msgId, {
      id: msgId,
      msgId,
      fileName,
      fileSize: 0,
      progress: 0,
      status: 'downloading',
      localPath: savePath,
    })

    const { listen } = await import('@tauri-apps/api/event')
    const unlisten = await listen<{ progress: number; status: string }>(`file:done:${msgId}`, (event) => {
      const task = tasks.value.get(msgId)
      if (task) {
        task.progress = event.payload.progress
        task.status = event.payload.status as FileTask['status']
      }
    })

    try {
      await tauriInvoke('download_file', { url, fileKey, savePath, msgId })
    } catch (e) {
      const task = tasks.value.get(msgId)
      if (task) {
        task.status = 'error'
        task.error = String(e)
      }
    }
  }

  function removeTask(id: string) {
    tasks.value.delete(id)
  }

  return { tasks, getTask, uploadFile, downloadFile, removeTask }
})
