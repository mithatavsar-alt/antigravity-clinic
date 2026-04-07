// ─── Treatment Content Data Layer ────────────────────────────
// Centralized, structured content for all treatment pages.
// Used by: dynamic [slug] route, homepage cards, insight panels, SEO.

export interface TreatmentItem {
  title: string
  desc?: string
}

export interface TreatmentSectionData {
  heading: string
  paragraphs: string[]
  items?: TreatmentItem[]
  itemColor?: 'gold' | 'green' | 'red'
  afterParagraphs?: string[]
}

export interface Treatment {
  slug: string
  title: string
  heroLabel: string
  heroSubtitle: string
  summary: string
  seo: { title: string; description: string }
  sections: TreatmentSectionData[]
}

export const TREATMENTS: Treatment[] = [
  // ═══════════════════════════════════════════════
  // BOTOKS
  // ═══════════════════════════════════════════════
  {
    slug: 'botox',
    title: 'Botoks Nedir?',
    heroLabel: 'Tedavi Bilgilendirme',
    heroSubtitle:
      'Mimik kaslarını geçici olarak dinlendirerek kırışıklıkların yumuşatılmasını sağlayan, dünyada en yaygın uygulanan minimal invaziv estetik prosedürlerden biridir.',
    summary: 'Mimik çizgilerini hedef alan hassas uygulama protokolü.',
    seo: {
      title: 'Botoks Nedir? — Dr. Müjde Ocak Aesthetic Clinic',
      description:
        'Botoks uygulaması hakkında bilmeniz gerekenler: etki mekanizması, uygulama bölgeleri, etki süresi ve olası riskler. Dr. Müjde Ocak kliniğinde güvenli estetik çözümler.',
    },
    sections: [
      {
        heading: 'Botoks nasıl etki eder?',
        paragraphs: [
          'Botulinum toksin (kısaca botoks), kas ile sinir arasındaki iletişimi geçici olarak azaltarak hedef kaslarda kontrollü bir gevşeme sağlar. Bu etki sayesinde yüz ifadesi sırasında oluşan mimik çizgileri belirgin şekilde yumuşar.',
          'Uygulama ince uçlu iğnelerle yapılır ve genellikle 10–15 dakika sürer. İşlem sonrası günlük yaşama hemen dönülebilir. Etki 3–7 gün içinde belirginleşmeye başlar.',
        ],
      },
      {
        heading: 'Hangi bölgelere uygulanır?',
        paragraphs: [
          'En sık tercih edilen uygulama bölgeleri, yüzün üst yarısındaki mimik kaslarıdır:',
        ],
        items: [
          { title: 'Alın', desc: 'Yatay alın çizgileri — kaş kaldırma hareketi sırasında belirginleşen çizgiler' },
          { title: 'Kaş arası (Glabella)', desc: 'Dikey kaş çatma çizgileri — kaşlar arasındaki "11" görünümlü hatlar' },
          { title: 'Göz çevresi (Kaz ayağı)', desc: 'Gülümseme ve kısma hareketi ile oluşan ince çizgiler' },
        ],
        itemColor: 'gold',
        afterParagraphs: [
          'Bunların dışında burun kanatları, çene ucu, platisma bandları ve aşırı terleme tedavisi gibi alanlarda da botoks kullanılabilir.',
        ],
      },
      {
        heading: 'Etkisi ne kadar sürer?',
        paragraphs: [
          'Botoks etkisi ortalama 4 ila 6 ay sürer. Bu süre kişinin kas yapısına, metabolizma hızına ve uygulanan bölgeye göre değişkenlik gösterebilir. İlk uygulamalarda etki süresi biraz daha kısa olabilirken, düzenli uygulama ile kasların dinlenme alışkanlığı kazanması sonucu etki süresi uzayabilir.',
          'Etkinin azalmaya başlaması ile birlikte prosedür güvenle tekrarlanabilir. Uygulamalar arasında en az 3 ay beklenmesi önerilir.',
        ],
      },
      {
        heading: 'Kimlere uygulanır?',
        paragraphs: [
          'Botoks, mimik kaynaklı kırışıklıkları olan ya da bu çizgilerin oluşumunu önlemek isteyen yetişkin bireylere uygulanabilir. Genellikle 25–65 yaş aralığında tercih edilmektedir.',
          'Hamilelik, emzirme döneminde veya nöromüsküler hastalığı olan kişilerde uygulanmaz. Tedavi kararı, yüz yapısı ve kişisel beklentiler doğrultusunda hekim tarafından verilir.',
        ],
      },
      {
        heading: 'Olası riskler',
        paragraphs: [
          'Botoks, dünyada milyonlarca kez güvenle uygulanan bir prosedürdür. Olası yan etkiler genellikle hafif ve geçicidir:',
        ],
        items: [
          { title: 'Uygulama noktasında hafif kızarıklık veya şişlik (birkaç saat)' },
          { title: 'Küçük morarma (birkaç gün içinde geçer)' },
          { title: 'Nadir durumlarda geçici kaş düşüklüğü (teknik hassasiyet ile minimize edilir)' },
        ],
        itemColor: 'red',
        afterParagraphs: [
          'Tüm estetik uygulamalarda olduğu gibi, işlemin deneyimli bir hekim tarafından, steril ortamda ve onaylı ürünlerle yapılması büyük önem taşır.',
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // DOLGU
  // ═══════════════════════════════════════════════
  {
    slug: 'filler',
    title: 'Dolgu Uygulamaları',
    heroLabel: 'Tedavi Bilgilendirme',
    heroSubtitle:
      'Hyalüronik asit bazlı dolgu maddeleri, yüzdeki hacim kaybını telafi ederek daha genç ve dinlenmiş bir görünüm sağlayan güvenli bir estetik uygulamadır.',
    summary: 'Yüz konturlarını yeniden şekillendiren hyalüronik asit tedavileri.',
    seo: {
      title: 'Dolgu Uygulamaları — Dr. Müjde Ocak Aesthetic Clinic',
      description:
        'Hyalüronik asit dolgu uygulamaları hakkında bilgilendirme: uygulama bölgeleri, kalıcılık süresi ve doğal görünüm. Dr. Müjde Ocak kliniğinde kişiye özel estetik çözümler.',
    },
    sections: [
      {
        heading: 'Dolgu nedir?',
        paragraphs: [
          'Dermal dolgu, cildin altına enjekte edilen ve doğal olarak vücutta bulunan hyalüronik asit (HA) bazlı jel bir maddedir. Yaşla birlikte azalan hacmi geri kazandırır, kırışıklıkları doldurur ve yüz hatlarını yeniden şekillendirir.',
          'Hyalüronik asit, vücutta doğal olarak bulunan bir moleküldür ve su tutma kapasitesi sayesinde ciltte dolgunluk ve nem sağlar. Uygulama 20–40 dakika sürer ve sonuçlar anında görülmeye başlar.',
        ],
      },
      {
        heading: 'Hangi bölgelerde kullanılır?',
        paragraphs: [
          'Dolgu uygulamaları yüzün farklı bölgelerinde kullanılarak dengeyi ve uyumu artırmayı hedefler:',
        ],
        items: [
          { title: 'Nazolabial hat', desc: 'Burun kenarından dudak köşesine uzanan çizgilerin yumuşatılması' },
          { title: 'Dudak', desc: 'Dudak hacminin artırılması veya sınırlarının belirginleştirilmesi' },
          { title: 'Yanak ve elmacık kemiği', desc: 'Orta yüz hacminin yeniden kazandırılması' },
          { title: 'Çene hattı (Jawline)', desc: 'Alt yüz konturunun belirginleştirilmesi ve sarkmaların önlenmesi' },
          { title: 'Göz altı', desc: 'Göz altı çukurluğunun yumuşatılması (gözyaşı oluğu dolgusu)' },
        ],
        itemColor: 'gold',
      },
      {
        heading: 'Ne kadar kalıcıdır?',
        paragraphs: [
          'Dolgu uygulamasının kalıcılık süresi kullanılan ürüne, uygulama bölgesine ve kişinin metabolizmasına bağlı olarak 6 ile 18 ay arasında değişir.',
          'Dudak dolgularında süre genellikle 6–9 ay iken, elmacık kemiklerinde ve çene hattında 12–18 aya kadar uzayabilir. Hyalüronik asit zaman içinde vücut tarafından doğal yollarla emilir; bu nedenle uygulama kalıcı değildir ve istenildiğinde tekrarlanabilir.',
        ],
      },
      {
        heading: 'Doğal görünüm',
        paragraphs: [
          'Modern dolgu uygulamalarının temel hedefi, doğallıktan ödün vermeden görünümü iyileştirmektir. Doğru teknik ve deneyimli bir hekimle, dolgu uygulaması "yaptırılmış" görünümden uzak, kişinin kendi yüz yapısını destekleyen sonuçlar verir.',
          'Tedavi planlaması sırasında hekim, yüz oranlarını, mevcut hacim dağılımını ve kişisel beklentileri birlikte değerlendirir. Kademeli uygulama yaklaşımı ile aşırı dolgunluk riski en aza indirilir.',
        ],
      },
      {
        heading: 'Uygulamaya hazırlık',
        paragraphs: [
          'İşlem öncesinde kan sulandırıcı ilaçlar ve takviyeler (aspirin, omega-3, E vitamini) hekime danışılarak kesilmelidir. Uygulama sonrası birkaç gün boyunca yoğun egzersiz, sauna ve yüze baskı uygulanmasından kaçınılması önerilir.',
          'İşlem sonrası hafif şişlik veya kızarıklık normal kabul edilir ve genellikle 1–3 gün içinde geriler. Ciddi bir komplikasyon nadirdir; ancak herhangi bir endişe durumunda hekimle iletişime geçilmelidir.',
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════
  // MEZOTERAPİ
  // ═══════════════════════════════════════════════
  {
    slug: 'mesotherapy',
    title: 'Mezoterapi Nedir?',
    heroLabel: 'Tedavi Bilgilendirme',
    heroSubtitle:
      'Cilt altına mikroenjeksiyon yöntemiyle uygulanan vitamin, mineral ve amino asit kokteylleri ile cildin içten dışa yenilenmesini sağlayan destekleyici bir estetik prosedürdür.',
    summary: 'Cilt yenileme ve rejenerasyon için vitamin kokteyli tedavisi.',
    seo: {
      title: 'Mezoterapi Nedir? — Dr. Müjde Ocak Aesthetic Clinic',
      description:
        'Mezoterapi uygulaması hakkında bilgilendirme: cilt yenileme, vitamin kokteylleri, uygulama alanları ve etkileri. Dr. Müjde Ocak kliniğinde kişiye özel cilt bakım çözümleri.',
    },
    sections: [
      {
        heading: 'Mezoterapi ne işe yarar?',
        paragraphs: [
          'Mezoterapi, cildin orta tabakasına (mezoderm) uygulanan mikroenjeksiyonlar aracılığıyla besleyici maddelerin doğrudan hedef bölgeye ulaşmasını sağlar. Kokteyl içeriği genellikle hyalüronik asit, vitaminler (C, E, B kompleksi), mineraller, amino asitler ve antioksidanlardan oluşur.',
          'Bu besleyici karışım cildin kendi yenilenme sürecini destekler, kollajen üretimini uyarır ve hücre metabolizmasını hızlandırır. Sonuç olarak cilt daha parlak, nemli ve canlı bir görünüm kazanır.',
        ],
      },
      {
        heading: 'Kimlere uygundur?',
        paragraphs: [
          'Mezoterapi, cilt kalitesini iyileştirmek isteyen hemen hemen herkese uygulanabilir. Özellikle aşağıdaki durumlar için tercih edilir:',
        ],
        items: [
          { title: 'Donuk ve yorgun görünümlü cilt', desc: 'Mevsimsel değişimler veya stres kaynaklı cilt matlaşması' },
          { title: 'Nem kaybı ve kuruluk', desc: 'Cildin derinlemesine nemlendirilerek elastikiyetinin artırılması' },
          { title: 'İnce çizgiler', desc: 'Erken dönem yaşlanma belirtilerinin geciktirilmesi' },
          { title: 'Leke ve ton eşitsizliği', desc: 'Melanin düzenleyici ve aydınlatıcı aktiflerle cilt tonunun eşitlenmesi' },
        ],
        itemColor: 'gold',
        afterParagraphs: [
          'Hamilelik, emzirme döneminde, aktif cilt enfeksiyonu olan veya otoimmün hastalık tedavisi gören kişilerde uygulama önerilmez.',
        ],
      },
      {
        heading: 'Cilt kalitesine etkisi',
        paragraphs: [
          'Mezoterapi\'nin ciltte sağladığı temel iyileşmeler:',
        ],
        items: [
          { title: 'Nem ve dolgunluk', desc: 'Hyalüronik asit ile derin hidrasyon sağlanır' },
          { title: 'Parlaklık', desc: 'Vitamin C ve antioksidanlar cilde ışıltılı bir görünüm kazandırır' },
          { title: 'Elastikiyet', desc: 'Kollajen ve elastin üretimi desteklenerek cilt sıkılaştırılır' },
          { title: 'Pürüzsüzlük', desc: 'İnce gözenekler küçülür, cilt dokusu düzleşir' },
        ],
        itemColor: 'green',
      },
      {
        heading: 'Uygulama süreci',
        paragraphs: [
          'Bir mezoterapi seansı yaklaşık 20–30 dakika sürer. Uygulama öncesinde bölgeye topikal anestezik krem uygulanarak konfor sağlanır. İnce uçlu iğneler veya mezogun cihazı ile kokteyl cildin altına enjekte edilir.',
          'Optimum sonuçlar için genellikle 3 ila 6 seanslık bir kür önerilir. Seanslar arasında 2–4 hafta beklenir. İşlem sonrası hafif kızarıklık veya küçük noktasal izler oluşabilir; bunlar 24–48 saat içinde kaybolur.',
        ],
      },
      {
        heading: 'Sonuçlar ne zaman görülür?',
        paragraphs: [
          'İlk seanstan sonra ciltte bir parlaklık ve nem artışı fark edilebilir. Ancak gerçek yapısal iyileşme (kollajen yenilenmesi, gözenek küçülmesi, sıkılaşma) kür tamamlandıktan sonra belirginleşir.',
          'Etki süresi kişinin yaşam tarzına, cilt bakım rutinine ve genel sağlık durumuna bağlı olarak 4 ila 6 ay sürer. Düzenli bakım seansları ile sonuçlar daha uzun süre korunabilir.',
        ],
      },
    ],
  },
]

// ─── Helpers ────────────────────────────────────────────────

export function getTreatment(slug: string): Treatment | undefined {
  return TREATMENTS.find((t) => t.slug === slug)
}

export function getRelatedTreatments(slug: string) {
  return TREATMENTS.filter((t) => t.slug !== slug).map((t) => ({
    label: t.title,
    href: `/treatments/${t.slug}`,
  }))
}

export function getAllSlugs() {
  return TREATMENTS.map((t) => t.slug)
}

// ─── Region → Treatment mapping (for InsightPanel) ─────────

export interface RegionInsight {
  region: string
  label: string
  analysis: string
  recommendation: string
  treatmentSlug: string
  treatmentLabel: string
}

export const REGION_INSIGHTS: Record<string, RegionInsight> = {
  goz_alti: {
    region: 'goz_alti',
    label: 'Göz Altı',
    analysis: 'Göz altı bölgesinde hacim kaybı ve çukurlaşma gözlemlenmektedir. Bu durum yorgun ve yaşlı bir görünüme yol açabilir.',
    recommendation: 'Gözyaşı oluğu dolgusu ile bu bölgedeki hacim kaybı doğal bir şekilde telafi edilebilir.',
    treatmentSlug: 'filler',
    treatmentLabel: 'Dolgu Uygulamaları',
  },
  nazolabial: {
    region: 'nazolabial',
    label: 'Nazolabial',
    analysis: 'Burun kenarından dudak köşesine uzanan nazolabial çizgiler belirginleşme eğilimindedir.',
    recommendation: 'Hyalüronik asit dolgu ile bu hatlar yumuşatılarak daha dinlenmiş bir görünüm elde edilebilir.',
    treatmentSlug: 'filler',
    treatmentLabel: 'Dolgu Uygulamaları',
  },
  kaz_ayagi: {
    region: 'kaz_ayagi',
    label: 'Kaz Ayağı',
    analysis: 'Göz çevresinde mimik kaynaklı ince çizgiler tespit edilmiştir.',
    recommendation: 'Botoks uygulaması ile göz çevresindeki mimik kasları dinlendirilerek bu çizgiler yumuşatılabilir.',
    treatmentSlug: 'botox',
    treatmentLabel: 'Botoks',
  },
  yanak: {
    region: 'yanak',
    label: 'Yanak',
    analysis: 'Yanak bölgesinde orta yüz hacim kaybına işaret eden bulgular gözlemlenmektedir.',
    recommendation: 'Elmacık kemiği ve yanak bölgesine dolgu uygulaması ile yüz konturları yeniden canlandırılabilir.',
    treatmentSlug: 'filler',
    treatmentLabel: 'Dolgu Uygulamaları',
  },
  alin: {
    region: 'alin',
    label: 'Alın',
    analysis: 'Alın bölgesinde yatay mimik çizgileri tespit edilmiştir.',
    recommendation: 'Botoks uygulaması ile alın kasları geçici olarak dinlendirilerek bu çizgiler belirgin şekilde azaltılabilir.',
    treatmentSlug: 'botox',
    treatmentLabel: 'Botoks',
  },
  dudak: {
    region: 'dudak',
    label: 'Dudak',
    analysis: 'Dudak hacmi ve konturu değerlendirme kapsamındadır.',
    recommendation: 'Dudak dolgusu ile hacim artırma veya dudak sınırlarının belirginleştirilmesi sağlanabilir.',
    treatmentSlug: 'filler',
    treatmentLabel: 'Dolgu Uygulamaları',
  },
}
