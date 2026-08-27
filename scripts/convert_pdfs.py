import os
import glob
import fitz  # PyMuPDF

assets_dir = r"C:\Users\Adnan\Downloads\upwork-mcp\assets"
pdf_files = glob.glob(os.path.join(assets_dir, "*.pdf"))

for pdf_file in pdf_files:
    print(f"Converting {pdf_file}...")
    try:
        doc = fitz.open(pdf_file)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better resolution
            base_name = os.path.splitext(os.path.basename(pdf_file))[0]
            
            if len(doc) == 1:
                output_name = f"{base_name}.png"
            else:
                output_name = f"{base_name}_page{page_num + 1}.png"
                
            output_path = os.path.join(assets_dir, output_name)
            pix.save(output_path)
            print(f"Saved {output_path}")
        doc.close()
        
        # Delete original PDF after successful conversion
        os.remove(pdf_file)
        print(f"Deleted {pdf_file}")
    except Exception as e:
        print(f"Failed to convert {pdf_file}: {e}")
