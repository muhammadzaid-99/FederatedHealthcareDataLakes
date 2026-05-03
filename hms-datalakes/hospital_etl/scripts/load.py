import pandas as pd
import os

# old = pd.read_parquet("checkups_20250720_203221.parquet")
# Set the option to display all columns
pd.set_option('display.max_columns', None)

old = pd.read_parquet("abc.parquet")

# print(old)

print(old)