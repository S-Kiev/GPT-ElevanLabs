import mic from 'mic';
import sound from 'sound-play';
import player from 'play-sound';
import { Writer } from 'wav';
import { Writable } from 'stream';
import fs, { createWriteStream } from 'fs';
import { OpenAI } from 'openai';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { HumanMessage, SystemMessage } from 'langchain/schema';
import voice from 'elevenlabs-node';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const keyword = 'luna';

let micInstance = mic ({rate: '16000', channels: '1', debug: false, exitOnSilence: 6});
let micInputStream = micInstance.getAudioStream();
let isRecording = false;
let audioChunks = [];

const  startRecordingProcess = () =>{
  console.log('Comenzando el proceso de grabación...');
  micInstance.stop();
  micInputStream.unpipe();
  micInstance = mic({rate: '16000', channels: '1', debug: false, exitOnSilence: 6});
  micInputStream = micInstance.getAudioStream();
  audioChunks = [];
  isRecording = true;
  micInputStream.pipe(new Writable({
    write(chunk, _, callback) {
      if (!isRecording) return callback();
      audioChunks.push(chunk);
      callback();
    }
  }));
  micInputStream.on('silence', handleSilence);
  micInstance.start();
};

const handleSilence = async () => {
  console.log('Silencio detectado...');
  if (!isRecording) return;
  isRecording = false;
  micInstance.stop();
  const audioFileName = await saveAudio(audioChunks);
  const message = await transcribeAudio(audioFileName);
  if(message && message.toLowerCase().includes(keyword)){
    console.log('Palabra clave detectada...');
    const responseText = await getOpenAIResponse(message);
    const fileName = await convertResponseToAudio(responseText);
    console.log('Procesando audio...');
    await sound.play('./audio/' + fileName);
    console.log('Finalizando...');
  }
  startRecordingProcess();
};

const getOpenAIResponse= async(message)=>{
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ "role": "user", "content": message }],
  });

  if(response){
    return response.choices[0].message.content;
  } else {
    return "Disculpa pero no te he entendido"
  }
}

const saveAudio = async audioChunks =>{
  return new Promise((resolve, reject) =>{
    console.log('Guardando audio...');
    const audioBuffer = Buffer.concat(audioChunks);
    const wavWriter = new Writer({ sampleRate: 16000, channels: 1});
    const fileName = `${Date.now()}.ogg`;
    const filePath = './audio/' + fileName;
    wavWriter.pipe(createWriteStream(filePath));
    wavWriter.on('finish', ()=> {
      resolve(fileName);
    });
    wavWriter.on('error', err=> {
      resolve(err);
    });
    wavWriter.end(audioBuffer);
  });
};

const transcribeAudio = async fileName =>{
  console.log('Transcribiendo audio...');
  const audioFile = fs.createReadStream('./audio/' + fileName);
  const transcriptionResponse = await openai.audio.transcriptions.create({
    file: audioFile, 
    model: 'whisper-1',
  });
  console.log(transcriptionResponse.text);


  return transcriptionResponse.text;
};


const convertResponseToAudio = async text => {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  const voiceID = 'wNy0B2Mc9AUUUS8xvkcw';
  const fileName = `${Date.now()}.mp3`;
  console.log('Convirtiendo la respuesta a audio...');
  const audioStream = await voice.textToSpeechStream(apiKey, voiceID, text);
  const fileWriteStream = fs.createWriteStream('./audio/' + fileName);
  audioStream.pipe(fileWriteStream);
  return new Promise((resolve, reject) => {
    fileWriteStream.on('finish', () => {
      // Reproduce el archivo de audio utilizando la biblioteca play-sound
      const audioFilePath = './audio/' + fileName;
      player().play(audioFilePath, err => {
        if (err) {
          console.error('Error al reproducir el archivo de audio:', err);
        } else {
          console.log('Reproducción del archivo de audio completada.');
        }
      });
      console.log('Conversación de audio finalizada...');
      resolve(fileName);
    });
    fileWriteStream.on('error', reject);
  });
};



startRecordingProcess();
process.stdin.resume();
