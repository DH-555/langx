import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Store, select } from '@ngrx/store';
import { Observable, Subscription, from, take } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { Filesystem, Directory, FileInfo } from '@capacitor/filesystem';
import { RecordingData, VoiceRecorder } from 'capacitor-voice-recorder';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { v4 as uuidv4 } from 'uuid';
import Compressor from 'compressorjs';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  GestureController,
  GestureDetail,
  IonContent,
  IonTextarea,
  ToastController,
} from '@ionic/angular';

// Interface Imports
import { Message } from 'src/app/models/Message';
import { User } from 'src/app/models/User';
import { ErrorInterface } from 'src/app/models/types/errors/error.interface';
import { createMessageRequestInterface } from 'src/app/models/types/requests/createMessageRequest.interface';
import { updateMessageRequestInterface } from 'src/app/models/types/requests/updateMessageRequest.interface';
import { RoomExtendedInterface } from 'src/app/models/types/roomExtended.interface';

// Service Imports
import { UserService } from 'src/app/services/user/user.service';

// Selector and Action Imports
import { currentUserSelector } from 'src/app/store/selectors/auth.selector';
import {
  createMessageAction,
  getMessagesWithOffsetAction,
  deactivateRoomAction,
  deleteMessageAction,
  clearErrorsAction,
  updateMessageAction,
} from 'src/app/store/actions/message.action';
import {
  errorSelector,
  isLoadingOffsetSelector,
  isLoadingSelector,
  messagesSelector,
  roomSelector,
  totalSelector,
  userDataSelector,
} from 'src/app/store/selectors/message.selector';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
})
export class ChatPage implements OnInit, OnDestroy {
  @ViewChild(IonContent) content: IonContent;
  @ViewChild('recordButton', { read: ElementRef }) recordButton: ElementRef;
  @ViewChild('myTextArea', { static: false }) myTextArea: IonTextarea;

  form: FormGroup;

  private subscriptions = new Subscription();
  room$: Observable<RoomExtendedInterface | null>;
  user$: Observable<User | null>;
  currentUser$: Observable<User | null>;
  isLoading$: Observable<boolean>;
  isLoading_offset$: Observable<boolean>;
  messages$: Observable<Message[] | null>;
  total$: Observable<number | null> = null;

  profilePic$: Observable<URL> = null;

  isTyping: boolean = false;
  roomId: string;

  file: File;

  // Add a flag to indicate whether it's the first load
  private isFirstLoad: boolean = true;

  model = {
    icon: 'chatbubbles-outline',
    title: 'No conversation',
    color: 'warning',
  };

  // Audio Variables
  isRecording: boolean = false;
  micPermission: boolean = false;
  storedFileNames: FileInfo[] = [];
  iconColorOfMic: string = 'medium';
  audioRef: HTMLAudioElement;
  audioId: string;

  // Reply and Edit Variables
  replyMessage: Message;
  editMessage: Message;

  // Counter Variables
  isCounterShow: boolean = false;

  constructor(
    private store: Store,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private toastController: ToastController,
    private gestureCtrl: GestureController
  ) {}

  async ngOnInit() {
    this.initValues();
    this.initForm();
  }

  ngAfterViewInit() {
    this.initValuesAfterViewInit();
    this.enableLongPress();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();

    this.room$
      .subscribe((room) => {
        if (room) {
          this.store.dispatch(deactivateRoomAction({ payload: room }));
        }
      })
      .unsubscribe();
  }

  initValues() {
    // TODO: Do we need it ?
    this.roomId = this.route.snapshot.paramMap.get('id') || null;

    this.room$ = this.store.pipe(select(roomSelector));
    this.user$ = this.store.pipe(select(userDataSelector));
    this.currentUser$ = this.store.pipe(select(currentUserSelector));
    this.isLoading$ = this.store.pipe(select(isLoadingSelector));
    this.isLoading_offset$ = this.store.pipe(select(isLoadingOffsetSelector));
    this.messages$ = this.store.pipe(select(messagesSelector));
    this.total$ = this.store.pipe(select(totalSelector));

    if (Capacitor.getPlatform() !== 'web') {
      // Scroll to bottom when keyboard is shown
      Keyboard.addListener('keyboardDidShow', (info) => {
        // console.log('keyboard did show with height:', info.keyboardHeight);
        setTimeout(() => {
          this.content.scrollToBottom(300);
        }, 100);
      });

      // Keyboard.addListener('keyboardDidHide', () => {
      //   // console.log('keyboard did hide');
      //   this.content.scrollToBottom(300);
      // });
    }
  }

  initForm() {
    this.form = new FormGroup({
      body: new FormControl('', {
        validators: [
          Validators.required,
          Validators.maxLength(500),
          this.notBlankValidator,
        ],
      }),
    });
  }

  initValuesAfterViewInit() {
    // Get the room
    this.subscriptions.add(
      this.room$.subscribe((room) => {
        this.roomId = room.$id;
      })
    );

    // To Scroll to bottom triggers
    this.subscriptions.add(
      this.room$.subscribe((room) => {
        if (room != null) {
          this.subscriptions.add(
            this.isUserAtBottom().subscribe((isAtBottom) => {
              if (isAtBottom || this.isFirstLoad) {
                // Wait for the view to update then scroll to bottom
                setTimeout(() => {
                  this.content.scrollToBottom(300);
                }, 0);
              }
            })
          );
        }
      })
    );

    // Set User photos
    this.subscriptions.add(
      this.user$.subscribe((user) => {
        this.profilePic$ = this.userService.getUserFilePreview(
          user?.profilePic
        );
      })
    );

    // Present Toast if error
    this.subscriptions.add(
      this.store
        .pipe(select(errorSelector))
        .subscribe((error: ErrorInterface) => {
          if (error) {
            this.presentToast(error.message, 'danger');
            // Reset Error State
            this.store.dispatch(clearErrorsAction());
          }
        })
    );
  }

  //
  // Form Submit
  //

  submitForm() {
    // Check if the message is not empty
    if (this.form.get('body').hasError('maxlength')) {
      this.presentToast('Message exceeds 500 characters.', 'danger');
      return;
    }

    // Check if the message is not empty
    if (!this.form.valid) {
      this.presentToast('Please type your message.', 'danger');
      return;
    }

    // Check if the message is edit message
    if (this.editMessage) {
      // Update the message
      const request: updateMessageRequestInterface = {
        $id: this.editMessage.$id,
        data: {
          body: this.form.value.body,
        },
      };
      this.store.dispatch(updateMessageAction({ request }));
    } else {
      // Create a new message
      this.user$.pipe(take(1)).subscribe((user) => {
        const request: createMessageRequestInterface =
          this.createMessageWithText(user);
        this.dispatchCreateMessageAction(request);
      });
    }

    // Scroll to bottom
    setTimeout(() => {
      this.content.scrollToBottom(300);
    }, 100);

    // Reset the form and the variables
    this.form.reset();
    this.audioId = null;
    this.replyMessage = null;
    this.editMessage = null;
  }

  private submitImage(file: File) {
    this.user$.pipe(take(1)).subscribe((user) => {
      // Create a new message
      const request: createMessageRequestInterface =
        this.createMessageWithImage(user);

      // Dispatch action to create message
      this.dispatchCreateMessageAction(request, file); // Include file here

      // Scroll to bottom
      setTimeout(() => {
        this.content.scrollToBottom(300);
      }, 100);

      // Reset the variable
      this.replyMessage = null;
    });
  }

  submitAudio(file: File) {
    this.user$.pipe(take(1)).subscribe((user) => {
      // Create a new message
      const request: createMessageRequestInterface =
        this.createMessageWithAudio(user);

      // Dispatch action to create message
      this.dispatchCreateMessageAction(request, file);

      // Scroll to bottom
      setTimeout(() => {
        this.content.scrollToBottom(300);
      }, 100);

      // Reset the variable
      this.audioId = null;
      this.replyMessage = null;
    });
  }

  //
  // Create Message Requests
  //

  createMessageWithText(user: User): createMessageRequestInterface {
    const request: createMessageRequestInterface = {
      $id: uuidv4().replace(/-/g, ''),
      roomId: this.roomId,
      to: user.$id,
      type: 'body',
      body: this.form.value.body,
      replyTo: this.replyMessage?.$id || null,
    };
    return request;
  }

  createMessageWithImage(user: User) {
    const request: createMessageRequestInterface = {
      $id: uuidv4().replace(/-/g, ''),
      roomId: this.roomId,
      to: user.$id,
      type: 'image',
      imageId: null,
      replyTo: this.replyMessage?.$id || null,
    };
    return request;
  }

  createMessageWithAudio(user: User) {
    const request: createMessageRequestInterface = {
      $id: this.audioId,
      roomId: this.roomId,
      to: user.$id,
      type: 'audio',
      audioId: null,
      replyTo: this.replyMessage?.$id || null,
    };
    return request;
  }

  // Dispatch action to create message
  dispatchCreateMessageAction(
    request: createMessageRequestInterface,
    file?: File
  ) {
    this.currentUser$.pipe(take(1)).subscribe((currentUser) => {
      const currentUserId = currentUser.$id;
      if (request) {
        this.store.dispatch(
          createMessageAction({
            messageType: request.type,
            request,
            currentUserId,
            file: file ? file : null,
          })
        );
      }
    });
  }

  //
  // onEnter
  //

  onEnter(event: any) {
    if (!event.shiftKey && Capacitor.getPlatform() === 'web') {
      event.preventDefault();
      // Call your form submit method here
      this.submitForm();
    }
  }

  //
  // onReply
  //

  onReply(message: Message) {
    this.editMessage = null;
    this.replyMessage = message;
    // console.log('Replying to:', this.replyMessage.$id);
    setTimeout(() => {
      this.myTextArea.setFocus();
    }, 100);
  }

  unlinkReply() {
    this.replyMessage = null;
  }

  //
  // onEdit
  //

  onEdit(message: Message) {
    this.replyMessage = null;
    this.editMessage = message;
    // console.log('Replying to:', this.replyMessage.$id);
    setTimeout(() => {
      this.form.patchValue({
        body: message.body,
      });
      this.myTextArea.setFocus();
    }, 100);
  }

  unlinkEdit() {
    this.editMessage = null;
    this.form.patchValue({
      body: '',
    });
  }

  //
  // onDelete
  //

  onDelete(message: Message) {
    // console.log('Deleting:', message.$id);
    this.store.dispatch(deleteMessageAction({ request: message }));
  }

  //
  // Select Image
  //

  async selectImage() {
    try {
      await this.requestCameraPermissions();
      const photo = await this.getCameraPhoto();
      if (!photo) return;

      let blob: Blob = this.dataURLtoBlob(photo.dataUrl);
      blob = await this.checkFileSize(blob);
      const file = new File([blob], this.roomId, {
        type: blob.type,
      });

      // Submit the image
      file ? this.submitImage(file) : this.presentToast('Please try again.');
    } catch (e) {
      this.presentToast('Please try again.', 'danger');
      console.log(e);
    }
  }

  //
  // Record Audio
  //

  enableLongPress() {
    const longPress = this.gestureCtrl.create(
      {
        el: this.recordButton.nativeElement,
        gestureName: 'long-press',
        threshold: 0,
        onWillStart: async (_: GestureDetail) => {
          await this.stop();
          this.loadFiles();
          await this.checkMicPermission();
          return Promise.resolve();
        },
        onStart: () => {
          if (!this.micPermission || this.isRecording) return;
          this.startRecording();
          Haptics.impact({ style: ImpactStyle.Light });
          this.changeColor('danger');
        },
        onEnd: () => {
          if (!this.micPermission || !this.isRecording) return;
          this.stopRecording();
          Haptics.impact({ style: ImpactStyle.Light });
          this.changeColor('medium');
        },
      },
      true
    );

    longPress.enable();
  }

  async handleAudioClick() {
    try {
      this.form.reset();

      // Upload audio if there is an audioId
      if (this.audioId) {
        const fileName = this.audioId;
        console.log('Audio file name:', fileName);

        const audioFile = await Filesystem.readFile({
          path: fileName,
          directory: Directory.Data,
        });

        const base64Sound = audioFile.data;

        // Convert base64 to blob using fetch API
        const audioResponse = await fetch(
          `data:audio/aac;base64,${base64Sound}`
        );
        const blob: Blob = await audioResponse.blob();

        const file = new File([blob], fileName);

        // Submit the audio
        file ? this.submitAudio(file) : this.presentToast('Please try again.');
      }
    } catch (error) {
      console.error('Error handling audio click:', error);
    }
  }

  //
  // Utils for image upload
  //

  private async requestCameraPermissions() {
    if (Capacitor.getPlatform() != 'web') await Camera.requestPermissions();
  }

  private async getCameraPhoto() {
    return await Camera.getPhoto({
      quality: 100,
      // allowEditing: true,
      source: CameraSource.Prompt,
      resultType: CameraResultType.DataUrl,
    }).catch((error) => {
      console.log(error);
    });
  }

  private dataURLtoBlob(dataurl: any) {
    var arr = dataurl.split(','),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  private async checkFileSize(
    blob: Blob,
    quality: number = 0.6,
    attempts: number = 0
  ): Promise<Blob> {
    // console.log(`Checking size: ${blob.size}`);
    if (blob.size > 2000000 && attempts < 10) {
      // limit to 5 attempts
      const compressedBlob = await this.compressImage(blob, quality);
      return this.checkFileSize(compressedBlob, quality * 0.8, attempts + 1);
    }
    return blob;
  }

  private compressImage(blob: Blob, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      new Compressor(blob, {
        quality: quality,
        success: (result: Blob) => {
          // console.log(`Compressed from ${blob.size} to ${result.size}`);
          resolve(result);
        },
        error: (error: Error) => {
          // console.log(`Compression error: ${error.message}`);
          reject(error);
        },
      });
    });
  }

  //
  // Utils for record audio
  //

  private async checkMicPermission() {
    if (Capacitor.getPlatform() != 'web') {
      this.micPermission = (
        await VoiceRecorder.hasAudioRecordingPermission()
      ).value;
      if (!this.micPermission) {
        this.micPermission = (
          await VoiceRecorder.requestAudioRecordingPermission()
        ).value;
      }
    } else {
      // TODO: This is for web!
      // this.micPermission = (
      //   await VoiceRecorder.requestAudioRecordingPermission()
      // ).value;
      this.micPermission = false;
      this.presentToast('Audio recording is not supported on web.', 'danger');
    }
  }

  private startRecording() {
    VoiceRecorder.startRecording().then(() => {
      this.isRecording = true;
      this.deleteRecording();
    });
  }

  private stopRecording() {
    VoiceRecorder.stopRecording().then(async (result: RecordingData) => {
      this.isRecording = false;
      // console.log(result.value.mimeType);
      // console.log(result.value.msDuration);
      if (result.value && result.value.recordDataBase64) {
        const recordData = result.value.recordDataBase64;

        // console.log('Record data', recordData);
        // Save the file to the device
        this.audioId = `${uuidv4().replace(/-/g, '')}`;
        await this.saveRecording(recordData);
      }
    });
  }

  private async loadFiles() {
    Filesystem.readdir({
      path: '',
      directory: Directory.Data,
    }).then((result) => {
      // console.log('Directory listing', result);
      this.storedFileNames = result.files;
    });
  }

  private async saveRecording(recordData: string) {
    await Filesystem.writeFile({
      path: this.audioId,
      data: recordData,
      directory: Directory.Data,
    });

    this.loadFiles();
  }

  async deleteRecording() {
    await this.stop();
    if (this.audioId) {
      await Filesystem.deleteFile({
        path: this.audioId,
        directory: Directory.Data,
      });
      this.audioId = null;
    }

    this.loadFiles();
  }

  // async deleteAllRecordings() {
  //   await Filesystem.readdir({
  //     path: '',
  //     directory: Directory.Data,
  //   }).then((result) => {
  //     // console.log('Directory listing', result);
  //     this.storedFileNames = result.files;
  //   });
  //   console.log('DETECTED: Stored file names', this.storedFileNames);
  //   if (this.storedFileNames && this.storedFileNames.length > 0) {
  //     for (let file of this.storedFileNames) {
  //       await Filesystem.deleteFile({
  //         path: file.name,
  //         directory: Directory.Data,
  //       });
  //     }
  //     this.storedFileNames = [];
  //     console.log('DELETED ALL:', this.storedFileNames);
  //   } else {
  //     console.log('No files to delete');
  //   }
  // }

  // async listAllRecordings() {
  //   await Filesystem.readdir({
  //     path: '',
  //     directory: Directory.Data,
  //   }).then((result) => {
  //     // console.log('Directory listing', result);
  //     this.storedFileNames = result.files;
  //   });
  //   console.log('LIST: Stored file names', this.storedFileNames);
  // }

  async play() {
    const audioFile = await Filesystem.readFile({
      path: this.audioId,
      directory: Directory.Data,
    });
    const base64Sound = audioFile.data;

    // Play the audio file
    this.audioRef = new Audio(`data:audio/aac;base64,${base64Sound}`);
    this.audioRef.oncanplaythrough = () => {
      // console.log('Audio file duration', this.audioRef.duration);
    };
    this.audioRef.onended = () => {
      this.audioRef = null;
    };
    this.audioRef.load();
    return this.audioRef.play();
  }

  async stop() {
    if (this.audioRef) {
      this.audioRef.pause();
      this.audioRef.currentTime = 0;
    }
  }

  async togglePlayStop() {
    if (this.isPlaying()) {
      this.stop();
    } else {
      await this.play();
    }
  }

  isPlaying(): boolean {
    return this.audioRef ? !this.audioRef.paused : false;
  }

  changeColor(color: string) {
    this.iconColorOfMic = color;
  }

  //
  // Infinite Scroll
  //

  loadMore(event) {
    // If it's the first load, do nothing and return
    if (this.isFirstLoad) {
      this.isFirstLoad = false;
      event.target.complete();
      return;
    }

    // Offset is the number of messages that we already have
    let offset: number = 0;

    this.messages$
      .subscribe((messages) => {
        if (messages) {
          offset = messages.length;
          this.total$
            .subscribe((total) => {
              if (offset < total) {
                this.store.dispatch(
                  getMessagesWithOffsetAction({
                    roomId: this.roomId,
                    offset: offset,
                  })
                );
              } else {
                event.target.disabled = true;
                console.log('All messages loaded');
              }
            })
            .unsubscribe();
        }
      })
      .unsubscribe();

    event.target.complete();
  }

  //
  // Utils for scroll to bottom
  //

  isUserAtBottom(): Observable<boolean> {
    return from(this.checkIfUserAtBottom());
  }

  async checkIfUserAtBottom(): Promise<boolean> {
    const scrollElement = await this.content.getScrollElement();
    // Calculate the bottom 10% position
    const bottomPosition = scrollElement.scrollHeight * 0.9;
    // The chat is considered to be at the bottom if the scroll position is greater than the bottom 10% position
    const atBottom =
      scrollElement.scrollTop + scrollElement.clientHeight >= bottomPosition;
    return atBottom;
  }

  //
  // Other Utils
  //

  typingFocus() {
    this.isTyping = true;
    this.onTypingStatusChange();

    if (Capacitor.getPlatform() === 'web') {
      setTimeout(() => {
        this.content.scrollToBottom(300);
      }, 100);
    }
  }

  typingBlur() {
    this.isTyping = false;
    this.onTypingStatusChange();
  }

  // TODO: #622
  onTypingStatusChange() {
    // console.log('onTypingStatusChange', this.isTyping);
  }

  footerClicked(event: Event) {
    // If the footer is clicked, set the focus back to the textarea
    !this.audioId ? this.myTextArea.setFocus() : null;
  }

  redirectUserProfile() {
    this.user$
      .subscribe((user) => {
        this.router.navigateByUrl(`/home/user/${user.$id}`);
      })
      .unsubscribe();
  }

  notBlankValidator(control: FormControl) {
    const isWhitespace = (control.value || '').trim().length === 0;
    const isValid = !isWhitespace;
    return isValid ? null : { whitespace: true };
  }

  checkCounter() {
    this.isCounterShow = this.form.controls['body'].value.length > 400;
  }

  trackByFn(index, item) {
    return item.$id;
  }

  //
  // Present Toast
  //

  async presentToast(msg: string, color?: string) {
    const toast = await this.toastController.create({
      message: msg,
      color: color || 'primary',
      duration: 1000,
      position: 'top',
    });

    await toast.present();
  }
}
