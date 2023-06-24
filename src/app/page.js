'use client'

import 'regenerator-runtime/runtime'
import { useState, useEffect, useRef } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
const tokenizer = require('sbd')

const chatGptApi = 'https://api.openai.com/v1/chat/completions'

const sampleAnswer = `Membuat mobil adalah sebuah proses yang kompleks dan membutuhkan pengetahuan dan keterampilan teknik yang mendalam. Biasanya, proses ini dilakukan oleh produsen mobil dengan peralatan dan fasilitas produksi yang khusus. Namun, di bawah ini adalah gambaran umum tentang tahapan-tahapan yang terlibat dalam pembuatan mobil:

Perencanaan dan Desain: Tahap awal dalam pembuatan mobil adalah perencanaan dan desain. Ini melibatkan tim insinyur dan desainer yang membuat sketsa, merancang bagian-bagian mobil, dan mengembangkan model 3D menggunakan perangkat lunak desain komputer.

Pengembangan Prototipe: Setelah desain awal selesai, langkah selanjutnya adalah membuat prototipe mobil. Ini melibatkan pembuatan bagian-bagian mobil secara terpisah, seperti rangka, bodi, mesin, sistem suspensi, dan lainnya. Prototipe ini digunakan untuk menguji dan mengevaluasi performa mobil.

Produksi Bagian-Bagian: Setelah prototipe dikembangkan dan diuji, produksi massal dimulai. Bagian-bagian mobil seperti rangka, bodi, mesin, transmisi, kelistrikan, dan interior diproduksi dalam jumlah besar menggunakan teknik manufaktur seperti pengecoran, stamping, dan penyambungan.

Perakitan: Setelah semua bagian diproduksi, tahap perakitan dimulai. Bagian-bagian tersebut dikirim ke pabrik mobil, di mana mereka dirakit bersama-sama oleh pekerja terampil menggunakan peralatan dan mesin khusus. Proses ini meliputi pemasangan mesin, transmisi, suspensi, sistem kelistrikan, dan interior mobil.

Uji Kualitas: Setelah mobil dirakit, mereka menjalani serangkaian tes dan inspeksi kualitas yang ketat. Ini meliputi pengujian performa, pengujian keamanan, dan pemeriksaan visual untuk memastikan mobil memenuhi standar yang ditetapkan.

Finishing dan Penyelesaian: Setelah lulus uji kualitas, mobil akan melalui tahap finishing. Ini melibatkan pemasangan komponen terakhir, seperti lampu, kaca, roda, dan aksesori tambahan. Mobil juga mendapatkan lapisan cat dan perlindungan akhir sebelum siap untuk pengiriman.

Distribusi dan Penjualan: Setelah mobil selesai diproduksi, mereka didistribusikan ke dealer-dealer mobil untuk dijual kepada konsumen. Ini melibatkan transportasi mobil ke tempat penjualan, pendaftaran, dan administrasi penjualan.

Harap diingat bahwa ini adalah gambaran umum tentang proses pembuatan mobil. Setiap produsen mobil mungkin memiliki proses yang sedikit berbeda tergantung pada teknologi dan metode produksi yang mereka gunakan.`

const stateObjMap = {
  "idle": {
    "gif_url": "/images/idle.gif",
    "state_copy": "Sedang bengong . . .",
    "main_button_copy": "Bicara!",
    "main_button_disabled": false,
  },
  "listening_question": {
    "gif_url": "/images/listen.gif",
    "state_copy": "Silakan bicara",
    "main_button_copy": "Sudah!",
    "main_button_disabled": false,
  },
  "waiting_chatgpt": {
    "gif_url": "/images/thinking.gif",
    "state_copy": "Nunggu neng gpt mikir . . .",
    "main_button_copy": "Sabar!",
    "main_button_disabled": true,
  },
  "waiting_talk": {
    "gif_url": "/images/talk.gif",
    "state_copy": "Nunggu neng lagi ngomong",
    "main_button_copy": "Cukuppp!",
    "main_button_disabled": false,
  },
}

const sentenceSplitterOpt = {
  "newline_boundaries" : true,
  "html_boundaries"    : false,
  "sanitize"           : true,
  "allowed_tags"       : false,
  "preserve_whitespace" : false,
  "abbreviations"      : null
}

var synth
var apiLock = false
let voices = []

if (typeof(window) !== 'undefined') {
  synth = window.speechSynthesis
  synth.onvoiceschanged = () => {
    voices = synth.getVoices()
  }
}

var messageHistory = [
  { 'role': 'system', 'content': 'saya sedang bersantai dan ingin berbicara dengan ringan, anggap saya sebagai anak anak dan kamu dapat menjawab pertanyaan saya dengan singkat. cobalah sebisa mungking jawab pertanyaan saya ketika apa yang saya katakan kurang jelas.' },
]

export default function Home() {
  const [currentState, setCurrentState] = useState("idle") // Enum: [idle, listening_question, waiting_chatgpt, waiting_talk]
  const [myQuestion, setMyQuestion] = useState("")
  const [chatGptAnswer, setChatGptAnswer] = useState("")
  const [chatGptKey, setChatGptKey] = useState(Buffer.from("c2stb3R6RkVxTWRlN3JTODBZUXg2SHZUM0JsYmtGSkZURFJHa2g2Z29QZURlN0g1eXBX", 'base64'))

  useEffect(() => {
    if (typeof(window) !== 'undefined') {
      // clientSideInit()
    }
  }, [])

  function clientSideInit() {
    if (typeof(localStorage) !== "undefined") {
      setChatGptKey(localStorage.getItem("chatGptKey") ? localStorage.getItem("chatGptKey") : "")
    } else {
      setChatGptKey("")
    }
  }

  // SPEECH TO TEXT
  const commands = [
    {
      command: ':content (*)',
      callback: (content, c2) => {
        handleMyQuestionCallback(`${content} ${c2}`)
      },
      matchInterim: false,
    },
  ]
  const {transcript, listening, resetTranscript, browserSupportsSpeechRecognition} = useSpeechRecognition({commands})

  function handleMyQuestionCallback(content) {
    setMyQuestion(content)
    callChatGptApi(content)
  }

  async function callChatGptApi(content) {
    if (apiLock) {
      console.log('locked')
      return
    }
    apiLock = true

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${chatGptKey}`
    }

    var contentObj = { 'role': 'user', 'content': content }
    messageHistory.push(contentObj)

    const body = JSON.stringify({
      'model': 'gpt-3.5-turbo',
      'messages': messageHistory,
    })
    console.log(body)

    // setCurrentState("waiting_chatgpt")
    // await delay(1000)
    // setChatGptAnswer(`${sampleAnswer} ${Date.now()}`)
    // apiLock = false
    // return

    try {
      setCurrentState("waiting_chatgpt")
      const response = await fetch(chatGptApi, {
        method: 'POST',
        headers: headers,
        body: body
      })
      if (response.status == 200) {
        const data = await response.json()
        console.log("CHAT GPT RESPONSE", data)
        const reply = data.choices[0].message.content
        setChatGptAnswer(reply)
      } else {
        const data = await response.json()
        console.error('Data:', data)
        setCurrentState("idle")
      }
    } catch (error) {
      console.error('Error:', error)
      setCurrentState("idle")
    }

    apiLock = false
  }

  useEffect(() => {
    nativeSpeak(chatGptAnswer)
  }, [chatGptAnswer])

  function nativeSpeak(text) {
    if (text === "") { return }
    setCurrentState("waiting_talk")
    synth.cancel()

    var sentences = tokenizer.sentences(text, sentenceSplitterOpt)

    sentences.forEach((sentence) => {
      iterateArrayInBatches(`${sentence}`.split(' '), 26, function(batch) {
        var joinedText = batch.join(" ")
        let speech = new SpeechSynthesisUtterance()
        speech.voice = voices[56]
        // speech.voice = voices[18]
        speech.lang = "id"
        speech.text = joinedText
        speech.rate = 1.2
        speech.pitch = 1.2
        speech.volume = 1
        if (batch.size < 26) {
          speech.onend = () => {setCurrentState("idle")}
        }
        synth.speak(speech)
      })
    })
  }

  function handleMainButtonClick() {
    if (currentState === "idle") {
      setCurrentState("listening_question")
      synth.cancel()
      SpeechRecognition.startListening({ language: 'id' })
    } else if (currentState === "listening_question") {
      SpeechRecognition.stopListening()
    } else if (currentState === "waiting_chatgpt") {

    } else if (currentState === "waiting_talk") {
      setCurrentState("idle")
      synth.cancel()
    }
  }

  return (
    <div className='bg-gray-100 w-full'>
      <div className="flex items-center justify-center">
        <div className="h-screen flex flex-col items-center justify-start pt-4">
          <div className='container mx-auto px-4 text-center min-w-[360px] max-w-[460px]'>
            <div className="bg-white shadow-md rounded-lg p-4 mb-4">
              <h1 className="text-4xl font-bold">Neng-GPT</h1>
              <small>ngobrol santuy sama neng (chat)gpt</small>
            </div>

            <div className="bg-white shadow-md rounded-lg p-4 w-full mb-4 justify-center items-center text-center">
              <p>🙎🏼‍♀️ {stateObjMap[currentState].state_copy}</p>
              <img
                src={stateObjMap[currentState].gif_url} alt="state"
                className='object-fill rounded-lg shadow-md mx-auto'
              />
              <p>{listening ? 'silakan berbicara' : ''}</p>
            </div>

            <div className='flex-col mb-4'>
              <div className='flex'>
                <button
                  className='shadow-md w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full mr-1 disabled:bg-gray-500'
                  onClick={()=>handleMainButtonClick()}
                  disabled={stateObjMap[currentState].main_button_disabled}
                >{stateObjMap[currentState].main_button_copy}</button>
              </div>
              <div>
                <small className='text-xs'>silakan bertanya apa saja ke neng gpt</small>
              </div>
            </div>

            <hr className='my-2' />

            <div className='flex-col mb-4 text-start'>
              <p>Pertanyaan</p>
              <p className='text-xs'>{transcript}</p>
              <textarea className="shadow-md block p-2.5 w-full text-sm text-gray-900 bg-gray-50 border rounded-lg" value={myQuestion} rows="2" readOnly></textarea>
            </div>

            <div className='flex-col mb-4 text-start'>
              <p>Jawaban</p>
              {/* <textarea className="shadow-md block p-2.5 w-full text-sm text-gray-900 bg-gray-50 border rounded-lg" value={chatGptAnswer} rows="4" readOnly></textarea> */}
              <ReactMarkdown
                children={chatGptAnswer} remarkPlugins={[remarkGfm]}
                className='h-[120px] bg-white rounded-lg border shadow-md p-1 overflow-auto text-xs'
              />
            </div>

            {/* <hr className='my-2' />

            <div className='flex-col mb-4'>
              <p>Config</p>
              <pre className='bg-white w-full border rounded-lg text-sm text-start p-1 mb-1'>
                chat gpt key: {chatGptKey ? "ready" : "not-ready"}
              </pre>
              <input
                type="text" className="p-1 form-control w-full rounded-lg border shadow-md mb-1" onChange={(e)=>setChatGptKey(e.target.value)}
                placeholder='your chat gpt api key here'
              />
              <button
                className='shadow-md w-full bg-blue-500 hover:bg-blue-700 text-white py-1 px-4 rounded-full mr-1'
                onClick={()=>{
                  localStorage.setItem("chatGptKey", chatGptKey)
                }}
              >Set cgpt key</button>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  )

  function iterateArrayInBatches(array, batchSize, callback) {
    for (let i = 0; i < array.length; i += batchSize) {
      const batch = array.slice(i, i + batchSize);
      callback(batch);
    }
  }

  function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }
}
