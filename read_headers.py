import pandas as pd
import sys

try:
    df = pd.read_excel('template.xlsx')
    print("EXTRACTION_HEADERS:" + ",".join(list(df.columns)))
    
    df_tint = pd.read_excel('tinting_template.xlsx')
    print("TINTING_HEADERS:" + ",".join(list(df_tint.columns)))
except Exception as e:
    print(f"ERROR: {str(e)}")
