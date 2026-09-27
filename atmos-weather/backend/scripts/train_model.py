from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
)


# ==========================================
# PATHS
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

# Data and model live under app/, not next to this script.
APP_DIR = BASE_DIR.parent / "app"

DATASET_PATH = APP_DIR / "data" / "weather_dataset.csv"

MODEL_DIR = APP_DIR / "models"

MODEL_PATH = MODEL_DIR / "rain_model.joblib"


# ==========================================
# FEATURES
# ==========================================

FEATURES = [
    "Temperature",
    "Humidity",
    "Wind_Speed",
    "Cloud_Cover",
    "Pressure",
]

TARGET = "Rain_Today"


# ==========================================
# LOAD DATASET
# ==========================================

print("=" * 70)
print("ATMOS - RAIN PREDICTION MODEL TRAINING")
print("=" * 70)

print("\nLoading dataset...")

df = pd.read_csv(DATASET_PATH)

print(f"Dataset loaded: {len(df)} records")

# Sort chronologically
df["Date"] = pd.to_datetime(df["Date"])

df = df.sort_values("Date").reset_index(drop=True)


# ==========================================
# CHECK DATA
# ==========================================

print("\nDataset information:")

print(df[FEATURES + [TARGET]].info())

print("\nRain distribution:")

print(
    df[TARGET]
    .value_counts()
    .sort_index()
)

print("\nRain percentage:")

print(
    (
        df[TARGET]
        .value_counts(normalize=True)
        .sort_index()
        * 100
    ).round(2)
)


# ==========================================
# REMOVE MISSING VALUES
# ==========================================

df = df.dropna(
    subset=FEATURES + [TARGET]
).reset_index(drop=True)


# ==========================================
# FEATURES / TARGET
# ==========================================

X = df[FEATURES]

y = df[TARGET]


# ==========================================
# CHRONOLOGICAL TRAIN / TEST SPLIT
# ==========================================

split_index = int(
    len(df) * 0.80
)

X_train = X.iloc[:split_index]
X_test = X.iloc[split_index:]

y_train = y.iloc[:split_index]
y_test = y.iloc[split_index:]


print("\n" + "=" * 70)
print("TRAIN / TEST SPLIT")
print("=" * 70)

print(f"Training records : {len(X_train)}")
print(f"Testing records  : {len(X_test)}")

print(
    f"Training period  : "
    f"{df['Date'].iloc[0].date()} "
    f"to "
    f"{df['Date'].iloc[split_index - 1].date()}"
)

print(
    f"Testing period   : "
    f"{df['Date'].iloc[split_index].date()} "
    f"to "
    f"{df['Date'].iloc[-1].date()}"
)


# ==========================================
# MODEL
# ==========================================

print("\nTraining Random Forest...")

model = RandomForestClassifier(
    n_estimators=500,
    class_weight="balanced",
    random_state=42,
    min_samples_leaf=2,
    n_jobs=-1,
)

model.fit(
    X_train,
    y_train
)


# ==========================================
# PREDICTION
# ==========================================

y_pred = model.predict(X_test)

y_probability = model.predict_proba(
    X_test
)[:, 1]


# ==========================================
# METRICS
# ==========================================

accuracy = accuracy_score(
    y_test,
    y_pred
)

precision = precision_score(
    y_test,
    y_pred,
    zero_division=0
)

recall = recall_score(
    y_test,
    y_pred,
    zero_division=0
)

f1 = f1_score(
    y_test,
    y_pred,
    zero_division=0
)

try:
    roc_auc = roc_auc_score(
        y_test,
        y_probability
    )
except ValueError:
    roc_auc = None


# ==========================================
# RESULTS
# ==========================================

print("\n" + "=" * 70)
print("MODEL EVALUATION")
print("=" * 70)

print(
    f"Accuracy  : {accuracy * 100:.2f}%"
)

print(
    f"Precision : {precision * 100:.2f}%"
)

print(
    f"Recall    : {recall * 100:.2f}%"
)

print(
    f"F1 Score  : {f1 * 100:.2f}%"
)

if roc_auc is not None:
    print(
        f"ROC-AUC   : {roc_auc:.4f}"
    )


# ==========================================
# CONFUSION MATRIX
# ==========================================

cm = confusion_matrix(
    y_test,
    y_pred
)

print("\nConfusion Matrix:")
print(cm)


# ==========================================
# CLASSIFICATION REPORT
# ==========================================

print("\nClassification Report:")

print(
    classification_report(
        y_test,
        y_pred,
        target_names=[
            "No Rain",
            "Rain"
        ],
        zero_division=0
    )
)


# ==========================================
# FEATURE IMPORTANCE
# ==========================================

print("\n" + "=" * 70)
print("FEATURE IMPORTANCE")
print("=" * 70)

feature_importance = pd.DataFrame({
    "Feature": FEATURES,
    "Importance": model.feature_importances_,
})

feature_importance = (
    feature_importance
    .sort_values(
        "Importance",
        ascending=False
    )
)

for _, row in feature_importance.iterrows():

    print(
        f"{row['Feature']:15} "
        f"{row['Importance']:.4f}"
    )


# ==========================================
# FINAL MODEL
# ==========================================

print("\nTraining final model on complete dataset...")

final_model = RandomForestClassifier(
    n_estimators=500,
    class_weight="balanced",
    random_state=42,
    min_samples_leaf=2,
    n_jobs=-1,
)

final_model.fit(
    X,
    y
)


# ==========================================
# SAVE MODEL
# ==========================================

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True
)

joblib.dump(
    final_model,
    MODEL_PATH
)


# ==========================================
# VERIFY MODEL
# ==========================================

print("\n" + "=" * 70)
print("MODEL SAVED")
print("=" * 70)

print(f"Path: {MODEL_PATH}")

print(
    f"Trees: {final_model.n_estimators}"
)

print(
    f"Features: {final_model.feature_names_in_}"
)

print(
    f"Classes: {final_model.classes_}"
)

print("\nTraining completed successfully!")

print("=" * 70)