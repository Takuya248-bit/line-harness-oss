-- === バリ島エリア情報 ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('bali_area', 'canggu', 'チャングーの雰囲気', 'サーファーとデジタルノマドが多い。おしゃれなカフェが密集。欧米人が多く英語環境が自然にできる', 'lifestyle,cafe,nomad', 'firsthand', 'verified'),
('bali_area', 'canggu', 'チャングーのカフェ学習環境', 'WiFi・電源完備のカフェが徒歩圏に10軒以上。Crate Cafe、Satu Satu等。授業後の自習に最適', 'cafe,study,wifi', 'firsthand', 'verified'),
('bali_area', 'ubud', 'ウブドの雰囲気', '田んぼとアートの街。静かで集中しやすい。ヨガリトリートが多く、自己成長志向の人が集まる', 'lifestyle,quiet,art', 'firsthand', 'verified'),
('bali_area', 'seminyak', 'スミニャックの特徴', 'ビーチクラブとショッピングの街。夜遊びスポットが多く、学習集中には向かないが週末の息抜きに最適', 'nightlife,shopping,beach', 'firsthand', 'verified');

-- === バリ留学FAQ ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('study_faq', 'beginner_ok', '英語初心者でも大丈夫か', '生徒の7割が初心者スタート。マンツーマンなので自分のペースで進められる。先生が日本人の苦手ポイントを熟知している', 'beginner,mantooman', 'firsthand', 'verified'),
('study_faq', 'one_week', '1週間で意味があるか', '1週間でも「英語で話す恐怖心がなくなった」という声が最多。完璧な英語力ではなく「話す自信」が最大の成果', 'short_term,confidence', 'student_feedback', 'verified'),
('study_faq', 'dorm_life', '寮生活はどうか', '個室あり。食事は朝昼付き。他の生徒と自然に交流できる環境。夜は自由時間で自習やバリ散策', 'dorm,food,community', 'firsthand', 'verified'),
('study_faq', 'making_friends', '友達はできるか', '少人数制なので生徒同士の距離が近い。共通の「英語を学びたい」目標があるので打ち解けやすい', 'community,friends', 'student_feedback', 'verified');

-- === バリリンガル固有情報 ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('barilingual', 'mantooman', 'マンツーマン授業の特徴', '1日5時間のマンツーマン。グループ授業なし。自分の弱点に集中できる。先生の変更も柔軟に対応', 'mantooman,curriculum', 'firsthand', 'verified'),
('barilingual', 'teachers', '講師の特徴', 'バリ人講師。日本人の英語の癖を理解している。フレンドリーで質問しやすい雰囲気', 'teachers,friendly', 'firsthand', 'verified'),
('barilingual', 'common_worries', 'よくある不安: 治安', 'バリ島は東南アジアの中でも治安が良い観光地。学校周辺は特に安全。ただし夜道の一人歩きは避ける', 'safety,worry', 'firsthand', 'verified'),
('barilingual', 'student_types', '生徒の年齢層', '20-40代が中心。社会人の転職前・リフレッシュ休暇が多い。大学生の春休み・夏休みも', 'demographics,age', 'firsthand', 'verified');

-- === 英語学習ナレッジ ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('english_learning', 'beginner_mistakes', '日本人の典型的ミス: 直訳', '"I am boring"（退屈させる人）と"I am bored"（退屈している）の混同。感情の-ed/-ing形容詞は最頻出ミス', 'grammar,mistakes,common_errors', 'firsthand', 'verified'),
('english_learning', 'speaking', 'スピーキング上達のコツ', '完璧な文法より「伝わる英語」を優先。短い文で区切る。相手の表現を真似る（シャドーイング的会話）', 'speaking,tips,natural_english', 'firsthand', 'verified'),
('english_learning', 'aizuchi', '英語の相づち', '"I see" "That makes sense" "Right" "Exactly"。日本語の「うんうん」に相当。相づちがあると会話が自然に続く', 'aizuchi,conversation,phrases', 'firsthand', 'verified'),
('english_learning', 'paraphrase', '言い換えテクニック', '知らない単語は説明で乗り切る。"refrigerator"が出なければ"the cold box in the kitchen"。これが実践英語', 'paraphrase,speaking,vocabulary', 'firsthand', 'verified'),
('english_learning', 'natural_english', '自然な英語表現', '"How are you?"への返答は"I am fine"より"Pretty good!" "Not bad!"が自然。教科書英語と実際の乖離が多い', 'natural_english,phrases,real', 'firsthand', 'verified');

-- === 実例・エピソード ===
INSERT INTO knowledge_entries (category, subcategory, title, content, tags, source, reliability) VALUES
('evidence', 'first_3days', '最初の3日間あるある', '初日は緊張で単語も出ない。2日目は先生のペースに慣れ始める。3日目に「あれ、少し聞き取れてる」と気づく', 'experience,beginner,student_change', 'student_feedback', 'verified'),
('evidence', 'one_week_change', '1週間後の変化', 'カフェで注文を英語でする自信がつく。"Can I get..."が自然に出る。先生以外の外国人にも話しかけられるようになる', 'change,confidence,real_scene', 'student_feedback', 'verified'),
('evidence', 'real_scene', 'バリで英語を使う場面', 'カフェ注文、タクシー交渉、サーフィンレッスン、レストランでの会話。日常が全て英語の実践場', 'real_scene,daily,practice', 'firsthand', 'verified'),
('evidence', 'outside_class', '授業外での変化', '寮で他の生徒と英語で雑談。ビーチで外国人と友達になる。インスタのDMを英語で返せるようになった', 'outside_class,community,growth', 'student_feedback', 'verified');

-- === ガードレール（IG用） ===
INSERT INTO content_guardrails (rule_type, platform, rule, example, priority) VALUES
('tone', 'ig', '柔らかく親しみやすい口調。断定しすぎない', '良: 「〜かも！」「〜してみて」 悪: 「〜すべき」「〜しなさい」', 9),
('prohibition', 'ig', '"ネイティブは〜"を多用しない。地域・個人差がある', '悪: 「ネイティブは絶対こう言います」', 8),
('prohibition', 'ig', '文化を主語大きくしすぎない', '悪: 「外国人は全員〜」「日本人は〜できない」', 8),
('caution', 'ig', 'エビデンスが弱い主張を断定しない', '悪: 「1週間で英語がペラペラに」 良: 「1週間で英語を話す自信がつく」', 9),
('tone', 'ig', 'テンプレ感を避け、具体的な場所名・シチュエーションを入れる', '良: 「チャングーのカフェで注文するとき」 悪: 「海外のお店で」', 7),
('expression', 'ig', '誇大表現を避ける。数字は根拠のあるものだけ使う', '悪: 「受講者の99%が満足」（根拠なし）', 9),
('prohibition', 'all', 'LINE登録の直接的なCTAは入れない。コメント誘導のみ', '良: 「好きな英単語をコメントで教えてね」', 10);
