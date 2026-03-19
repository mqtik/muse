import { createSignal, createEffect, For, onMount } from 'solid-js'
import type { JSX } from 'solid-js'

export interface TabItem {
  id: string
  label: string
  icon: JSX.Element
}

interface TopTabBarProps {
  tabs: TabItem[]
  activeTab: string
  onSelect: (id: string) => void
  accentColor?: string
}

export default function TopTabBar(props: TopTabBarProps) {
  let navRef: HTMLElement | undefined
  const [humpLeft, setHumpLeft] = createSignal(0)

  const updateHumpPosition = () => {
    if (!navRef) return
    const items = navRef.querySelectorAll<HTMLElement>('[data-tab-id]')
    items.forEach((item) => {
      if (item.dataset.tabId === props.activeTab) {
        const navRect = navRef!.getBoundingClientRect()
        const itemRect = item.getBoundingClientRect()
        const itemCenter = itemRect.left - navRect.left + itemRect.width / 2
        setHumpLeft(itemCenter - 45)
      }
    })
  }

  onMount(updateHumpPosition)
  createEffect(() => {
    props.activeTab
    requestAnimationFrame(updateHumpPosition)
  })

  const accent = () => props.accentColor || '#8b5cf6'

  return (
    <div class="relative w-full" style={{ 'z-index': 1 }}>
      <nav
        ref={navRef}
        class="relative flex flex-row"
        style={{
          background: 'rgba(255,255,255,0.06)',
          'backdrop-filter': 'blur(10px)',
          '-webkit-backdrop-filter': 'blur(10px)',
          'box-shadow': '0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <For each={props.tabs}>
          {(tab) => {
            const isActive = () => props.activeTab === tab.id
            return (
              <button
                data-tab-id={tab.id}
                onClick={() => props.onSelect(tab.id)}
                class="flex-1 relative flex flex-col items-center pt-3 pb-4 cursor-pointer transition-all duration-300"
              >
                <span
                  class="text-[11px] font-semibold uppercase tracking-wider transition-all duration-500"
                  style={{
                    color: isActive() ? accent() : 'rgba(255,255,255,0.4)',
                    transform: isActive() ? 'translateY(0)' : 'translateY(4px)',
                    opacity: isActive() ? 1 : 0.6,
                  }}
                >
                  {tab.label}
                </span>
                <div
                  class="mt-1.5 transition-all duration-500"
                  style={{
                    color: isActive() ? accent() : 'rgba(255,255,255,0.3)',
                    transform: isActive() ? 'translateY(8px)' : 'translateY(0)',
                  }}
                >
                  {tab.icon}
                </div>
              </button>
            )
          }}
        </For>
      </nav>

      <svg
        class="absolute pointer-events-none"
        style={{
          left: `${humpLeft()}px`,
          bottom: '0',
          'margin-bottom': '-23px',
          transition: 'left 300ms ease-out',
        }}
        viewBox="0 0 90 22"
        width="90"
        height="22"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0 0h90C70 0 66 22 45 22S20 0 0 0z"
          fill="rgba(255,255,255,0.06)"
        />
      </svg>
    </div>
  )
}
