<template>
  <div class="location-message" @click="handleOpen">
    <div class="location-card">
      <div class="location-info">
        <p class="location-name ellipsis">{{ name }}</p>
        <span class="location-addr ellipsis">{{ address }}</span>
      </div>
      <div class="location-map">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="#3369fe">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  content: string
  isSelf: boolean
}>()

interface LocationContent {
  name?: string
  address?: string
  lat?: number
  lng?: number
}

const parsed = computed<LocationContent>(() => {
  try { return JSON.parse(props.content) } catch { return {} }
})

const name = computed(() => parsed.value.name || '')
const address = computed(() => parsed.value.address || '')

function handleOpen() {
  const { lat, lng } = parsed.value
  if (lat && lng) {
    window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank')
  }
}
</script>

<style lang="scss" scoped>
.location-message {
  cursor: pointer;
}

.location-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 4px;
  min-width: 200px;
  max-width: 260px;
}

.location-info {
  flex: 1;
  min-width: 0;

  .location-name {
    font-size: 14px;
    color: #333;
    line-height: 1.4;
  }

  .location-addr {
    font-size: 12px;
    color: #999;
    margin-top: 2px;
    display: block;
  }
}

.location-map {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(51, 105, 254, 0.1);
  border-radius: 4px;
}
</style>
