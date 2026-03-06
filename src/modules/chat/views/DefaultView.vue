<script setup lang="ts">
</script>

<template>
  <div class="default-view">
    <div class="empty-state">
      <img src="@/assets/images/logo/logo.png" alt="OCS Chat" class="logo" />
      <p>OCS Chat</p>
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
  color: #ccc;

  .logo {
    width: 80px;
    height: 80px;
    opacity: 0.3;
  }

  p {
    margin-top: 12px;
    font-size: 14px;
  }
}
</style>
