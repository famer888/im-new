import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/modules/auth/views/LoginPage.vue'),
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'Default',
        component: () => import('@/modules/chat/views/DefaultView.vue'),
      },
    ],
  },
  {
    path: '/chat',
    name: 'ChatWindow',
    component: () => import('@/modules/chat/views/ChatWindow.vue'),
    props: (route) => ({ id: route.query.id }),
  },
  {
    path: '/notification',
    name: 'Notification',
    component: () => import('@/modules/chat/views/NotificationView.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
