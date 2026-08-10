"""
PhishGuard AI — Automated demo screenshot script.
Takes live screenshots of each page of the running app.
"""
import pyautogui
import time
import os

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3

SCREENSHOTS_DIR = r"C:\Users\Vansh\.gemini\antigravity\brain\3622e0da-c4ac-4560-9afa-f49847381191"

def shot(name):
    path = os.path.join(SCREENSHOTS_DIR, f"{name}.png")
    pyautogui.screenshot(path)
    print(f"  Saved: {name}.png")
    return path

def click(x, y):
    pyautogui.moveTo(x, y, duration=0.4)
    pyautogui.click()
    time.sleep(0.2)

# Get screen size
w, h = pyautogui.size()
print(f"Screen: {w}x{h}")

# First, focus Chrome and go to the app
pyautogui.hotkey('alt', 'tab')  # Focus Chrome
time.sleep(1)

print("\n=== STEP 1: Dashboard ===")
time.sleep(2)
shot("live_01_dashboard")

print("\n=== STEP 2: URL Scanner ===")
# Click "URL Scanner" in sidebar (approx x=120, varies by screen)
# Sidebar width = 240px, nav items start around y=180
sidebar_x = 120
click(sidebar_x, 220)  # URL Scanner nav item
time.sleep(1)
shot("live_02_scanner_empty")

print("\n=== STEP 3: Click Typosquat example chip ===")
# Quick URL chips are below the input, roughly centered
# Screen center x, y around 40% from top
screen_cx = w // 2
# Chips are roughly at y = topbar(60) + page padding(28) + header(80) + input(60) + chip row
# Approximate: y ~ 320
chip_y = int(h * 0.38)
# First chip (Typosquat) is roughly at screen_cx - 200
click(screen_cx - 180, chip_y)
time.sleep(0.5)
shot("live_03_scanning")

# Wait for scan to complete (up to 4 seconds)
print("  Waiting for scan result...")
time.sleep(3.5)
shot("live_04_scanner_result")

print("\n=== STEP 4: Campaign Graph ===")
click(sidebar_x, 264)  # Campaign Graph nav item
time.sleep(1)
shot("live_05_campaign_empty")

# Click "Run Clustering" button
# The button is in a card roughly at top-right area of content
# Content starts at x = 240 (sidebar width), button approx at 70% width
btn_x = int(240 + (w - 240) * 0.7)
btn_y = int(h * 0.28)
click(btn_x, btn_y)
time.sleep(2.5)
shot("live_06_campaign_graph")

print("\n=== STEP 5: Brand Shield ===")
click(sidebar_x, 345)  # Brand Shield nav item
time.sleep(1)
shot("live_07_brand_shield")

print("\n=== STEP 6: Tech Stack ===")
click(sidebar_x, 390)  # Tech Stack nav item
time.sleep(1)
shot("live_08_tech_stack")

print("\nAll screenshots saved!")
