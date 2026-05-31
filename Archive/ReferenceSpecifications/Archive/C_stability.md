

# スクリプト内での C_stability の定義

`compute_C_columns` 関数で C_stability を計算しています。ここで使っているしきい値は定数として定義されています。

### 使用している指標

- `E_std_6`：直近 6 ヶ月の Engagement の標準偏差
- `E_momentum_3`：直近 3 ヶ月の平均 − その前 3 ヶ月の平均

### しきい値（短期）

コード上の定義は：

- `STABILITY_STD_STABLE = 1.0`
   → `E_std_6 <= 1.0` かつ `|E_momentum_3| < 0.5` なら「安定」
- `STABILITY_STD_UNSTABLE = 2.5`
   → `E_std_6 >= 2.5` なら「不安定」

実際の判定ロジックは：

- まず履歴が十分ある人（`MID_MIN_RECORDS = 3`）に対して、
  - `range_e/v/d/a` がほぼゼロなら → **「不変」**
  - そうでなく、`E_std_6 <= 1.0` かつ `|E_momentum_3| < 0.5` なら → **「安定」**
  - そうでなく、`E_std_6 >= 2.5` なら → **「不安定」**
  - それ以外 → **「やや安定」**

ここで重要なのは：

- **「不安定」の条件にモメンタムは使っていない**（標準偏差だけ）
- したがって、「SD_within ≥ Y」という形で書き直すなら

> **短期の C_stability における「不安定」の Y は 2.5（E_std_6 ≥ 2.5）**

となります。

------

## 2. 長期安定性（C_stability_long）の Y

同じ関数内で、12ヶ月ベースの長期安定性 `C_stability_long` も定義されています。

こちらでは：

- `E_std_12`（12ヶ月の SD）
- `E_momentum_6`（6ヶ月モメンタム）

を用いて、

- `STABILITY_STD_STABLE_LONG = 1.5`
- `STABILITY_STD_UNSTABLE_LONG = 3.0`

をしきい値にしています。

ロジックは短期と同様で、

- `E_std_12 <= 1.5` かつ `|E_momentum_6| < 0.8` → 「持続安定」
- `E_std_12 >= 3.0` → 「持続不安定」
- など。

したがって長期側では、

> **長期の C_stability_long における「持続不安定」の Y は 3.0（E_std_12 ≥ 3.0）**

と書けます。

------

## 3