import os
from PIL import Image

def generate_assets():
    logo_path = 'src/assets/images/logo.png'
    assets_dir = 'assets'
    os.makedirs(assets_dir, exist_ok=True)
    
    print(f"Loading logo from: {logo_path}")
    logo = Image.open(logo_path)
    
    # logo is 612 x 408
    logo_w, logo_h = logo.size
    print(f"Logo size: {logo_w}x{logo_h}")
    
    # 1. Generate icon-only.png (1024x1024, solid white background, logo centered)
    # We want it to be larger than 600px width. Let's scale to 820px width for iOS.
    scale_w_ios = 820
    scale_h_ios = int(scale_w_ios * logo_h / logo_w)
    logo_scaled_ios = logo.resize((scale_w_ios, scale_h_ios), Image.Resampling.LANCZOS)
    
    icon_only = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
    offset_x_ios = (1024 - scale_w_ios) // 2
    offset_y_ios = (1024 - scale_h_ios) // 2
    icon_only.paste(logo_scaled_ios, (offset_x_ios, offset_y_ios), logo_scaled_ios)
    icon_only.save(os.path.join(assets_dir, 'icon-only.png'))
    print("Generated assets/icon-only.png (820px width)")

    # 2. Generate icon-foreground.png (1024x1024, transparent background, logo centered)
    # For Android adaptive icons, let's scale to 670px width (safe inside circular boundary).
    scale_w_android = 670
    scale_h_android = int(scale_w_android * logo_h / logo_w)
    logo_scaled_android = logo.resize((scale_w_android, scale_h_android), Image.Resampling.LANCZOS)
    
    icon_foreground = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    offset_x_android = (1024 - scale_w_android) // 2
    offset_y_android = (1024 - scale_h_android) // 2
    icon_foreground.paste(logo_scaled_android, (offset_x_android, offset_y_android), logo_scaled_android)
    icon_foreground.save(os.path.join(assets_dir, 'icon-foreground.png'))
    print("Generated assets/icon-foreground.png (670px width)")
    
    # 3. Generate icon-background.png (1024x1024, solid white)
    icon_background = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
    icon_background.save(os.path.join(assets_dir, 'icon-background.png'))
    print("Generated assets/icon-background.png")
    
    # 4. Generate splash.png (2732x2732, light bg #f8f7f4, logo scaled to 1100x733 centered)
    splash_w, splash_h = 2732, 2732
    splash_scale_w = 1100
    splash_scale_h = int(splash_scale_w * logo_h / logo_w)
    logo_splash_scaled = logo.resize((splash_scale_w, splash_scale_h), Image.Resampling.LANCZOS)
    
    splash = Image.new('RGBA', (splash_w, splash_h), (248, 247, 244, 255)) # #f8f7f4
    offset_x_splash = (splash_w - splash_scale_w) // 2
    offset_y_splash = (splash_h - splash_scale_h) // 2
    splash.paste(logo_splash_scaled, (offset_x_splash, offset_y_splash), logo_splash_scaled)
    splash.save(os.path.join(assets_dir, 'splash.png'))
    print("Generated assets/splash.png")
    
    # 5. Generate splash-dark.png (2732x2732, dark bg #0e0e0e, logo scaled to 1100x733 centered)
    splash_dark = Image.new('RGBA', (splash_w, splash_h), (14, 14, 14, 255)) # #0e0e0e
    splash_dark.paste(logo_splash_scaled, (offset_x_splash, offset_y_splash), logo_splash_scaled)
    splash_dark.save(os.path.join(assets_dir, 'splash-dark.png'))
    print("Generated assets/splash-dark.png")

if __name__ == '__main__':
    generate_assets()
