import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D

# データのシミュレーション（論文のN=93に近いデータを生成）
np.random.seed(42)
n_employees = 93

# 1. 軸1: 現在位置 (Current Position) - WEスコア (0-54)
# 正規分布に近いが、少しばらつきを持たせる
current_we = np.random.normal(23.39, 12.42, n_employees)
current_we = np.clip(current_we, 0, 54)

# 2. 軸2: トレンド (Trend) - 傾き (Slope)
# -1.5 (急降下) から +1.5 (急上昇) の範囲
trend_slope = np.random.normal(0, 0.5, n_employees)

# 3. 軸3: 特性 (Characteristics) - Recovery Rate (0.0 - 1.0)
# 論文によるとMedian=0が多いが、分布させるためにランダム生成
recovery_rate = np.random.exponential(0.2, n_employees)
recovery_rate = np.clip(recovery_rate, 0, 1.0)

# 4. 介入優先度スコア (Priority Score) の算出ロジック (論文に基づく簡易版)
# トレンドが低い(-)、現在位置が低い(Low)、特性が低い場合にスコアが高くなる
priority_score = np.zeros(n_employees)

for i in range(n_employees):
    score = 0
    # トレンド要因
    if trend_slope[i] < -0.5: score += 5  # 低下加速・危機
    elif trend_slope[i] < 0: score += 2   # 低下懸念
    
    # 現在位置要因
    if current_we[i] < 15: score += 2     # Low/Critical
    
    # 特性要因（回復力が低いとリスク増）
    if recovery_rate[i] < 0.1 and trend_slope[i] < 0: score += 2
    
    # 上限は10
    priority_score[i] = np.clip(score, 0, 10)

# --- 3Dグラフの描画 ---
fig = plt.figure(figsize=(12, 9))
ax = fig.add_subplot(111, projection='3d')

# 散布図のプロット
# 色(c)を優先度スコア、サイズ(s)を少し大きめに設定
img = ax.scatter(current_we, trend_slope, recovery_rate, 
                 c=priority_score, cmap='jet', s=60, alpha=0.8, edgecolors='k')

# 軸ラベルの設定
ax.set_xlabel('Axis 1: Current WE Score (0-54)', fontsize=11, labelpad=10)
ax.set_ylabel('Axis 2: Trend Slope (Decline <-> Growth)', fontsize=11, labelpad=10)
ax.set_zlabel('Axis 3: Resilience (Recovery Rate)', fontsize=11, labelpad=10)

# タイトル
ax.set_title('3D Visualization of WE Intervention Priority System\n(Based on 3-Axis Analysis)', fontsize=14)

# カラーバー（介入優先度）
cbar = fig.colorbar(img, ax=ax, shrink=0.6, aspect=10)
cbar.set_label('Intervention Priority Score (0-10)', fontsize=12)

# ゾーンの注釈（概念的な理解のため）
# 危険ゾーン（左・手前・下）
ax.text(5, -1.0, 0.1, "High Risk Zone\n(Urgent Intervention)", color='red', fontsize=10, weight='bold')
# 成長ゾーン（右・奥・上）
ax.text(45, 1.0, 0.8, "Thriving Zone\n(Job Assignment)", color='green', fontsize=10, weight='bold')

# 視点の調整（見やすい角度へ）
ax.view_init(elev=20, azim=135)

plt.tight_layout()
plt.show()