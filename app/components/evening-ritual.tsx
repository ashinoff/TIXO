"use client";
/* eslint-disable @next/next/no-img-element -- editorial ritual photographs retain their composition */

import { usePhotoStory } from "@/lib/use-photo-story";
import { ArrowIcon } from "./ui-icon";

export const ritualScenes = [
  { image: "/assets/ritual/real-candle/01-space.webp", label: "Место", moment: "ПЕРЕД ПЕРВЫМ ОГНЁМ", title: "Освободи место\nдля тишины", lead: "Вечер начинается с маленькой паузы.", care: "Поставь свечу на устойчивую негорючую подставку. Оставь вокруг свободное пространство — вдали от сквозняков, штор и других вещей, которые могут загореться.", alt: "Незажжённая чёрная свеча на широкой каменной подставке в спокойном тёмном интерьере" },
  { image: "/assets/ritual/real-candle/02-light.webp", label: "Огонь", moment: "", title: "Зажги свечу —\nи дай вечеру начаться", lead: "", care: "", alt: "Рука подносит длинную зажжённую спичку к фитилю чёрной ребристой свечи" },
  { image: "/assets/ritual/real-candle/03-stay.webp", label: "Мгновение", moment: "ПОКА СВЕЧА ГОРИТ", title: "Пусть всё\nподождёт", lead: "Аромат раскрывается. Ты остаёшься рядом.", care: "Наслаждайся светом, не оставляя огонь без присмотра. Береги свечу от детей и животных. Пока воск горячий, не двигай её.", alt: "Тихое золотистое пламя над чёрной свечой отражается на тёмном камне" },
  { image: "/assets/ritual/real-candle/04-extinguish.webp", label: "Пауза", moment: "КОГДА ВЕЧЕР ЗАКОНЧИЛСЯ", title: "Заверши вечер\nмягко", lead: "Огонь гаснет. Ощущение остаётся.", care: "Аккуратно погаси пламя — например, специальным колпачком. Убедись, что фитиль больше не тлеет, и дай воску полностью остыть. Не гаси свечу водой.", alt: "Латунный колпачок над погашенной свечой, от фитиля поднимается тонкая нить дыма" },
  { image: "/assets/ritual/real-candle/05-return.webp", label: "Возвращение", moment: "ДО СЛЕДУЮЩЕГО ВЕЧЕРА", title: "Сохрани\nэто чувство", lead: "У хорошего вечера может быть продолжение.", care: "Когда свеча полностью остынет, убери её от прямого солнца и источников тепла. Защити от пыли — например, стеклянным колпаком. Перед новым огнём колпак обязательно сними.", alt: "Остывшая незажжённая чёрная свеча под прозрачным стеклянным колпаком на каменной подставке" },
] as const;

export function EveningRitual() {
  const { root, frames, setFrames, currentIndex, busy, paused, dragging, holding, layers, onKey, onPointerDown, finishGesture, releasePointer } = usePhotoStory(ritualScenes);

  return <section className="evening-ritual pad" id="care" aria-labelledby="care-title">
    <header className="ritual-story-heading"><div><p className="eyebrow">04 / ПРОСТОЙ РИТУАЛ</p><h2 id="care-title">Чтобы свет<br /><span>радовал дольше</span></h2></div><p>Пять мгновений одного вечера.<br />От первого огня до следующей встречи.</p></header>
    <div ref={root} className={`ritual-story${dragging ? " is-dragging" : ""}${holding ? " is-held" : ""}`} role="region" aria-roledescription="карусель" aria-label="Пять мгновений тихого вечера" tabIndex={0} aria-describedby="ritual-gesture-help" aria-keyshortcuts="ArrowLeft ArrowRight Home End Space" data-scene={currentIndex} data-playing={!paused} aria-busy={busy}
      onKeyDown={onKey} onPointerDown={onPointerDown} onPointerUp={event => finishGesture(event)} onPointerCancel={event => finishGesture(event, true)} onLostPointerCapture={event => releasePointer(event.pointerId)}>
      <div className="ritual-story-layers" aria-live={paused ? "polite" : "off"}>
        {layers.map((frame, index) => {
          const current = index === layers.length - 1;
          const scene = ritualScenes[frame.index];
          return <article key={frame.key} className={`ritual-story-frame${current && frames.previous ? " is-revealing" : !current ? " is-leaving" : ""}`} aria-hidden={!current || undefined} inert={!current || undefined} aria-label={`${frame.index + 1} из 5: ${scene.label}`}
            onAnimationEnd={event => { if (!holding && current && event.target === event.currentTarget) setFrames(last => ({ ...last, previous: null })); }}>
            {!frame.failed && <img src={scene.image} alt={scene.alt} width="1536" height="1024" loading="eager" draggable={false}
              onLoad={() => { if (current && !frame.ready) setFrames(last => ({ ...last, current: { ...last.current, ready: true } })); }}
              onError={() => { if (current) setFrames(last => ({ ...last, current: { ...last.current, ready: true, failed: true } })); }} />}
            <div className="ritual-story-shade" />
            <div className="ritual-story-copy">{scene.moment && <span className="eyebrow">{String(frame.index + 1).padStart(2, "0")} / {scene.moment}</span>}<h3>{scene.title}</h3>{scene.lead && <p className="ritual-story-lead">{scene.lead}</p>}{scene.care && <p className="ritual-story-care">{scene.care}</p>}</div>
          </article>;
        })}
      </div>
      <div className="ritual-story-top"><span>ТИХО / ИСКУССТВО МАЛЕНЬКИХ ПАУЗ</span><span>{String(currentIndex + 1).padStart(2, "0")} <i>/ 05</i></span></div>
      <p className="ritual-drag-hint" aria-hidden="true">Листайте влево или вправо · удерживайте для паузы <span>мышью · свайпом · Shift + колесо</span></p>
      <p id="ritual-gesture-help" className="sr-only">Стрелки влево и вправо меняют сцену. Home — первая, End — последняя. Пробел останавливает или продолжает автосмену. Удерживайте палец или левую кнопку мыши на фотографии, чтобы остановить её. Отпустите, чтобы продолжить.</p>
    </div>
    <div className="ritual-afterglow"><div><p className="eyebrow">ВАШ МАЛЕНЬКИЙ ПЛАН НА ВЕЧЕР</p><h2>Меньше спешки<br /><span>Больше себя</span></h2></div><div><p>Одна свеча. Любимый аромат.<br />И немного времени, которое только твоё.</p><a className="button button-glass" href="#collection">Выбрать свою свечу <span aria-hidden="true"><ArrowIcon /></span></a></div></div>
  </section>;
}
