<script setup lang="ts">
import emptyBrandImg from '@/assets/images/common/defalut-icon.png'
</script>

<template>
  <div class="default-view">
    <div class="empty-state">
      <img :src="emptyBrandImg" alt="" class="empty-brand-icon" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.default-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.empty-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-brand-icon {
  width: 144px;
  height: auto;
  display: block;
}
</style>
