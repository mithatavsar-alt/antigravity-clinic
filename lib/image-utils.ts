export async function processPhoto(file: File): Promise<{ blob: Blob; url: string }> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Dosya 5MB'dan büyük olamaz")

  const validTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!validTypes.includes(file.type)) throw new Error('Geçersiz dosya formatı. JPEG, PNG veya WebP yükleyin.')

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Dosya okunamadı'))
    reader.readAsDataURL(file)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const maxW = 1200
      const scale = img.width > maxW ? maxW / img.width : 1
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Görsel işlenemedi'))
          const url = URL.createObjectURL(blob)
          resolve({ blob, url })
        },
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => reject(new Error('Görsel yüklenemedi'))
  })
}
