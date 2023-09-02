import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/services/auth/auth.service';

@Component({
  selector: 'app-edit',
  templateUrl: './edit.page.html',
  styleUrls: ['./edit.page.scss'],
})
export class EditPage implements OnInit {

  isLoading: boolean = false;
  currentUser: any;

  textAreaValue: string = '';
  textAreaDisabled: boolean = true;

  studyLanguages$: any;
  aboutMe$: any;

  constructor(
    private authService: AuthService,
    private toastController: ToastController,
    private router: Router
  ) { }

  ngOnInit() {
    this.getProfileInfo();
  }

  getProfileInfo() {
    //showLoader();
    this.isLoading = true;
    this.authService.getUserData().then(user => {
      this.currentUser = user;
      this.textAreaValue = this.currentUser.aboutMe;
      this.aboutMe$ = this.authService.aboutMe.subscribe(aboutMe => {
        if(aboutMe) {
          this.currentUser.aboutMe = aboutMe;
          this.textAreaValue = aboutMe;
          this.textAreaDisabled = true;
        }
      });
      this.studyLanguages$ = this.authService.studyLanguages.subscribe(studyLanguages => {
        if(studyLanguages) {
          this.currentUser.studyLanguages = studyLanguages;
        }
      });
    //hideLoader();
    this.isLoading = false;
    })
  }

  ngOnDestroy() {
    this.studyLanguages$.unsubscribe();
  }

  //
  // Edit PP
  //

  deletePP() {
    this.presentToast('At least one profile picture required.');
  }

  //
  // Edit About Me
  //

  ionInputAboutMe(event) {
    if(event.target.value != this.currentUser.aboutMe) {
      this.textAreaDisabled = false;
    } else { this.textAreaDisabled = true; }
    this.currentUser.aboutMe = event.target.value;
  }

  saveAboutMe() {
    this.isLoading = true;
    this.authService.updateUserAboutData(this.currentUser).then(() => {
      this.presentToast('About me saved.');
      this.isLoading = false;
    })
  }

  //
  // Edit Languages
  //

  editLanguages() {
    this.router.navigate(['/home/profile/edit/languages']);
  }

  deleteLanguage(language) {
    this.isLoading = true;
    this.currentUser.studyLanguages = this.currentUser.studyLanguages.filter(item => item !== language);
    this.currentUser.languagesArray = this.currentUser.languagesArray.filter(item => item !== language.code);
    this.authService.updateUserLanguageData(this.currentUser).then(() => {
      this.presentToast('Language deleted.');
      this.isLoading = false;
    });
  }

  //
  // Present Toast
  //

  async presentToast(msg: string) {
    const toast = await this.toastController.create({
      message: msg,
      duration: 1500,
      position: 'bottom',
    });

    await toast.present();
  }

}