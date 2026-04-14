export const READ_BURN_TIME_OPTIONS = [
  { value: 5, label: '5秒' },
  { value: 10, label: '10秒' },
  { value: 30, label: '30秒' },
  { value: 60, label: '1分钟' },
  { value: 3600, label: '1小时' },
  { value: 21600, label: '6小时' },
  { value: 43200, label: '12小时' },
  { value: 86400, label: '1天' },
  { value: 259200, label: '3天' },
  { value: 604800, label: '7天' },
]

export function getReadBurnTimeText(seconds?: number | null): string {
  const value = Number(seconds || 30)
  const item = READ_BURN_TIME_OPTIONS.find((option) => option.value === value)
  return item?.label || '30秒'
}
