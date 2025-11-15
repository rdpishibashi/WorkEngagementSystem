Report フォルダは、Google Form を使って各メンバーにアンケートに答えてもらい、その入力内容を元に Work Engagement を分析しレポートする Work Engagement Report プロジェクトの GASスクリプトと、Google Spreadsheet を Excel にしてダウンロードしたファイル一式である。

Admin フォルダは、Work Engagement Report プロジェクトによって記録されたデータ（RatingSS が主なデータソース）をもとに、組織全体の分析を行うための処理を行う Work Engagement Admin プロジェクトの GASスクリプトと、Google Spreadsheet を Excel にしてダウンロードしたファイル一式である。毎月 updateMaster 関数を実行して、Engagement Master にその月の分析データを追加記録する。

# Report folder: Google Apps Scripts (exported to text files)
evaluate.txt
make_charts.txt
make_indivual.txt
make_mail_contents.txt
record_engagement.txt
send_response.txt
set_globals.txt
utilities.txt
ConvertHtml.txt

# Admin folder: Google Apps Scripts (exported to text files)
Globals.txt
master_updater.txt
engagement_management.txt
comment_management.txt
member_management.txt
maintenance.txt
utilities.txt
initial_setup.txt

# Google Spreadsheets (exported to Excel files)
MasterSS.xlsx
AdviceSS.xlsx
RatingSS.xlsx
MemberSS.xlsx
MessageSS.xlsx
SayingSS.xlsx
AnswerSS.xlsx
CommentSS.xlsx
