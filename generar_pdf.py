import asyncio
from playwright.async_api import async_playwright
import os

async def generate_pdf():
    html_path = os.path.abspath("presentacion_proyecto.html").replace("\\", "/")
    pdf_path = os.path.abspath("Presentacion_Registro_De_Puntos.pdf")
    
    print(f"Abriendo HTML: file:///{html_path}")
    print(f"Destino PDF: {pdf_path}")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True
        )
        page = await browser.new_page()
        await page.goto(f"file:///{html_path}", wait_until="networkidle")
        
        await page.pdf(
            path=pdf_path,
            format="A4",
            landscape=True,
            print_background=True,
            margin={"top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm"}
        )
        await browser.close()
        print("EXITO: El archivo PDF se genero correctamente.")

if __name__ == "__main__":
    asyncio.run(generate_pdf())
