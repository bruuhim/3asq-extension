/// <reference path="../typing/manga-provider.d.ts" />

class Provider {
    private api: string = "https://3asq.org"
    private userAgent: string = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    private async fetch(url: string, opts: RequestInit = {}): Promise<Response> {
        return fetch(url, {
            ...opts,
            headers: {
                "User-Agent": this.userAgent,
                "Referer": this.api + "/",
                ...opts.headers,
            }
        })
    }

    // Search for manga based on a query. Returns a list of search results.
    async search({ query }: QueryOptions): Promise<SearchResult[]> {
        const url = `${this.api}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const results: SearchResult[] = []

        $(".c-tabs-item__content, .tab-content-wrap, .c-tabs-item").each((i, el) => {
            const titleEl = el.find(".post-title h3 a, .post-title a")
            if (titleEl.length() === 0) return

            const title = titleEl.text().trim()
            const href = titleEl.attr("href")
            if (!href) return

            const slugMatch = href.match(/\/manga\/([^/]+)\//)
            if (!slugMatch) return
            const slug = slugMatch[1]

            const imgEl = el.find("img")
            const image = imgEl.attr("src")?.trim() || imgEl.attr("data-src")?.trim()

            results.push({
                id: slug,
                title: title,
                image: image
            })
        })

        return results
    }

    // Returns the chapters based on the manga ID (slug).
    async findChapters(mangaId: string): Promise<ChapterDetails[]> {
        const url = `${this.api}/manga/${mangaId}/`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const chapters: ChapterDetails[] = []
        
        $(".wp-manga-chapter").each((i, el) => {
            const a = el.find("a")
            const href = a.attr("href")
            if (!href) return

            const slugMatch = href.match(/\/manga\/[^/]+\/([^/]+)\//)
            if (!slugMatch) return
            const chapterSlug = slugMatch[1]
            const title = a.text().trim()

            chapters.push({
                id: `${mangaId}$${chapterSlug}`,
                url: href,
                title: title,
                chapter: chapterSlug,
                index: 0 // Placeholder
            })
        })

        // Return sorted in ascending order (Seanime requirement)
        chapters.reverse()
        chapters.forEach((chapter, index) => {
            chapter.index = index
        })

        return chapters
    }

    // Returns the chapter pages based on the chapter ID (mangaSlug$chapterSlug).
    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const [mangaId, chapterSlug] = chapterId.split("$")
        const url = `${this.api}/manga/${mangaId}/${chapterSlug}/`
        const resp = await this.fetch(url)
        const html = await resp.text()
        const $ = LoadDoc(html)

        const pages: ChapterPage[] = []

        $(".wp-manga-chapter-img").each((i, el) => {
            const src = el.attr("src")?.trim() || el.attr("data-src")?.trim()
            if (src) {
                pages.push({
                    url: src,
                    index: i,
                    headers: {
                        "Referer": this.api + "/"
                    }
                })
            }
        })

        return pages
    }

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }
}
