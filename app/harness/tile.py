import sys, glob
from PIL import Image
files = sys.argv[2:]
out = sys.argv[1]
ims = [Image.open(f) for f in files]
w = max(i.width for i in ims); h = max(i.height for i in ims)
cols = min(len(ims), int(sys.argv[0] and 4))
cols = 4 if ims[0].width < 600 else 2
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols - 1) * 8, rows * h + (rows - 1) * 8), (90, 90, 90))
for k, im in enumerate(ims):
    sheet.paste(im, ((k % cols) * (w + 8), (k // cols) * (h + 8)))
scale = 1600 / sheet.width
sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)))
sheet.save(out)
print(out, sheet.size)
